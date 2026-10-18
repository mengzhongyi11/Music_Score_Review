package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sync"

	"score-review/server-go/internal/rules"
)

// EmbeddingService 是 server/src/services/embeddingService.ts 的 Go 移植。
//
// 负责调用 DashScope embedding API 生成规则向量，并缓存到
// $DATA_DIR/rule_embeddings.json，检索时用余弦相似度做内存暴力扫描。
//
// ⚠ 与 Node 版一致，**没有接向量库**：向量存本地 JSON，检索是 O(n) 全量遍历。
// 本环境 DashScope 账户欠费，initVectorIndex 会失败并降级到关键词匹配。
type EmbeddingService struct {
	client   *DashScopeClient
	cacheMu  sync.RWMutex
	dataDir  string
	// 向量就绪标志：对应 Node 的模块级 embeddingsReady
	ready bool
}

// NewEmbeddingService 创建向量服务。
func NewEmbeddingService(client *DashScopeClient, dataDir string) *EmbeddingService {
	return &EmbeddingService{client: client, dataDir: dataDir}
}

// cacheData 是落盘的缓存结构，字段名与 TS 的 CacheData 一致。
type cacheData struct {
	Model      string      `json:"model"`
	Dimension  int         `json:"dimension"`
	Texts      []string    `json:"texts"`
	Embeddings [][]float64 `json:"embeddings"`
}

func (s *EmbeddingService) cacheFile() string {
	return filepath.Join(s.dataDir, "rule_embeddings.json")
}

// loadCache 读取缓存；结构不完整（如空对象 {}）视为无缓存，与 Node 一致。
func (s *EmbeddingService) loadCache() *cacheData {
	raw, err := os.ReadFile(s.cacheFile())
	if err != nil {
		return nil
	}
	var data cacheData
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil
	}
	if data.Texts == nil || data.Embeddings == nil {
		return nil
	}
	return &data
}

func (s *EmbeddingService) saveCache(data *cacheData) {
	raw, err := json.Marshal(data)
	if err != nil {
		return
	}
	if err := os.MkdirAll(s.dataDir, 0o755); err != nil {
		return
	}
	_ = os.WriteFile(s.cacheFile(), raw, 0o644)
}

// EnsureEmbeddings 为规则文本生成并缓存向量。
//
// 缓存校验与 Node 一致：字段完整 + 数量匹配才复用，否则整批重新生成
// （Node 每批 10 条调用 API）。
func (s *EmbeddingService) EnsureEmbeddings(ctx context.Context, texts []string, force bool) ([][]float64, error) {
	if !force {
		if cached := s.loadCache(); cached != nil &&
			len(cached.Texts) == len(texts) && len(cached.Embeddings) == len(texts) {
			return cached.Embeddings, nil
		}
	}

	const batchSize = 10
	all := make([][]float64, 0, len(texts))

	for i := 0; i < len(texts); i += batchSize {
		end := i + batchSize
		if end > len(texts) {
			end = len(texts)
		}
		vecs, err := s.client.Embed(ctx, texts[i:end])
		if err != nil {
			return nil, fmt.Errorf("embedding 第 %d 批失败: %w", i, err)
		}
		all = append(all, vecs...)
	}

	if len(all) != len(texts) {
		return nil, fmt.Errorf("embedding 数量不匹配：预期 %d，实际 %d", len(texts), len(all))
	}

	dim := 0
	if len(all) > 0 {
		dim = len(all[0])
	}
	s.cacheMu.Lock()
	s.saveCache(&cacheData{Model: DashScopeEmbeddingModel, Dimension: dim, Texts: texts, Embeddings: all})
	s.ready = true
	s.cacheMu.Unlock()

	return all, nil
}

// InitVectorIndex 为知识库全部条目生成向量并开启向量检索路径。
//
// 对应 Node 的 initVectorIndex()：把每条规则的「标题 + 描述」拼接后整批向量化，
// 成功则 ready=true，之后 SearchKeyword 之外的向量路径才可用。
// 失败时**不 panic、不阻断启动**，由调用方告警后降级为关键词匹配。
func (s *EmbeddingService) InitVectorIndex(ctx context.Context, kb *rules.KnowledgeBase) error {
	if s.Ready() {
		return nil
	}

	entries := kb.Entries()
	texts := make([]string, 0, len(entries))
	for _, e := range entries {
		texts = append(texts, e.Title+" "+e.Description)
	}
	if len(texts) == 0 {
		return errors.New("知识库为空，跳过向量索引")
	}

	if _, err := s.EnsureEmbeddings(ctx, texts, false); err != nil {
		return err
	}

	s.MarkReady()
	return nil
}

// Ready 报告向量索引是否可用（对应 Node 的 embeddingsReady）。
func (s *EmbeddingService) Ready() bool {
	s.cacheMu.RLock()
	defer s.cacheMu.RUnlock()
	return s.ready
}

// MarkReady 由知识库在初始化完成后置位。
func (s *EmbeddingService) MarkReady() {
	s.cacheMu.Lock()
	s.ready = true
	s.cacheMu.Unlock()
}

// SearchSimilar 把 query 向量化后在缓存里做全量余弦相似度扫描，取 topK。
func (s *EmbeddingService) SearchSimilar(ctx context.Context, query string, topK int) ([]SimilarHit, error) {
	cached := s.loadCache()
	if cached == nil || len(cached.Embeddings) == 0 {
		return nil, errors.New("向量缓存为空")
	}

	vecs, err := s.client.Embed(ctx, []string{query})
	if err != nil {
		return nil, err
	}
	if len(vecs) == 0 {
		return nil, errors.New("query 向量为空")
	}
	queryVec := vecs[0]

	hits := make([]SimilarHit, 0, len(cached.Embeddings))
	for i, emb := range cached.Embeddings {
		hits = append(hits, SimilarHit{Index: i, Score: cosineSimilarity(queryVec, emb)})
	}
	// 与 JS 的 sort 一样需要稳定排序，并列时顺序才不漂移
	stableSortByScoreDesc(hits)

	if topK < len(hits) {
		hits = hits[:topK]
	}
	return hits, nil
}

// SimilarHit 一条相似度结果。
type SimilarHit struct {
	Index int
	Score float64
}

// cosineSimilarity 手写余弦相似度（与 TS 实现一致）。
func cosineSimilarity(a, b []float64) float64 {
	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	var dot, normA, normB float64
	for i := 0; i < n; i++ {
		dot += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	denom := math.Sqrt(normA) * math.Sqrt(normB)
	if denom == 0 {
		return 0
	}
	return dot / denom
}

func stableSortByScoreDesc(hits []SimilarHit) {
	// 插入排序即可（topK 场景下 n 很小且要求稳定）
	for i := 1; i < len(hits); i++ {
		for j := i; j > 0 && hits[j].Score > hits[j-1].Score; j-- {
			hits[j], hits[j-1] = hits[j-1], hits[j]
		}
	}
}
