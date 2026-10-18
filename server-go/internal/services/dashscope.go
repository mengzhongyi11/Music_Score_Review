package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"score-review/server-go/internal/rules"
)

const (
	dashScopeGenerationURL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation"
	dashScopeEmbeddingURL  = "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding"

	// DashScopeModel 与 Node 版写死的模型名一致
	DashScopeModel = "qwen3.7-flash"
	// DashScopeEmbeddingModel 同上
	DashScopeEmbeddingModel = "text-embedding-v2"
)

// DashScopeClient 封装 DashScope 的文本生成与 embedding 调用。
//
// ⚠ 与 Node 版的一个重要差异：**必须显式设置超时**。
// Node 的 fetch 有平台默认行为，而 Go 的 http.Client 零值表示**永不超时**，
// 外部服务不响应时会把连接永久挂住。这里给生成 30s、向量 60s。
type DashScopeClient struct {
	apiKey    string
	genClient *http.Client
	embClient *http.Client
}

// NewDashScopeClient 创建客户端。apiKey 为空时所有调用会直接报错，
// 由上层降级处理（与 Node 版"未配置则抛错/返回 null"一致）。
func NewDashScopeClient(apiKey string) *DashScopeClient {
	return &DashScopeClient{
		apiKey:    apiKey,
		genClient: &http.Client{Timeout: 30 * time.Second},
		embClient: &http.Client{Timeout: 60 * time.Second},
	}
}

// HasKey 报告是否配置了 API Key。
func (c *DashScopeClient) HasKey() bool { return c.apiKey != "" }

/* ── 请求/响应结构 ── */

type dashScopeMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type dashScopeRequest struct {
	Model      string `json:"model"`
	Input      struct {
		Messages []dashScopeMessage `json:"messages"`
	} `json:"input"`
	Parameters struct {
		ResultFormat string  `json:"result_format"`
		Temperature  float64 `json:"temperature"`
	} `json:"parameters"`
}

type dashScopeResponse struct {
	Output *struct {
		Choices []struct {
			Message      *struct{ Content string `json:"content"` } `json:"message"`
			FinishReason string                                   `json:"finish_reason"`
		} `json:"choices"`
	} `json:"output"`
	Usage *struct {
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

// generate 发起一次文本生成调用，返回回复正文与 token 用量。
func (c *DashScopeClient) generate(ctx context.Context, system, user string, temperature float64) (string, int, error) {
	if c.apiKey == "" {
		return "", 0, errors.New("DASHSCOPE_API_KEY 未配置")
	}

	var body dashScopeRequest
	body.Model = DashScopeModel
	body.Input.Messages = []dashScopeMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	}
	body.Parameters.ResultFormat = "message"
	body.Parameters.Temperature = temperature

	raw, err := json.Marshal(body)
	if err != nil {
		return "", 0, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, dashScopeGenerationURL, bytes.NewReader(raw))
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.genClient.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errText, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return "", 0, fmt.Errorf("DashScope API 错误 (%d): %s", resp.StatusCode, string(errText))
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", 0, err
	}

	var parsed dashScopeResponse
	if err := json.Unmarshal(data, &parsed); err != nil {
		return "", 0, err
	}
	if parsed.Output == nil || len(parsed.Output.Choices) == 0 ||
		parsed.Output.Choices[0].Message == nil || parsed.Output.Choices[0].Message.Content == "" {
		return "", 0, errors.New("DashScope 返回空结果")
	}

	tokens := 0
	if parsed.Usage != nil {
		tokens = parsed.Usage.OutputTokens
	}
	return parsed.Output.Choices[0].Message.Content, tokens, nil
}

type embeddingRequest struct {
	Model string `json:"model"`
	Input struct {
		Texts []string `json:"texts"`
	} `json:"input"`
}

type embeddingResponse struct {
	Output *struct {
		Embeddings []struct {
			TextIndex int       `json:"text_index"`
			Embedding []float64 `json:"embedding"`
		} `json:"embeddings"`
	} `json:"output"`
	Usage *struct {
		TotalTokens int `json:"total_tokens"`
	} `json:"usage"`
}

// Embed 调用 DashScope embedding，返回与入参顺序一致的向量。
func (c *DashScopeClient) Embed(ctx context.Context, texts []string) ([][]float64, error) {
	if c.apiKey == "" {
		return nil, errors.New("DASHSCOPE_API_KEY 未配置")
	}

	var body embeddingRequest
	body.Model = DashScopeEmbeddingModel
	body.Input.Texts = texts

	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, dashScopeEmbeddingURL, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.embClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errText, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("Embedding API 错误 (%d): %s", resp.StatusCode, string(errText))
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var parsed embeddingResponse
	if err := json.Unmarshal(data, &parsed); err != nil {
		return nil, err
	}
	if parsed.Output == nil || len(parsed.Output.Embeddings) == 0 {
		return nil, errors.New("Embedding 返回空")
	}

	// 按 text_index 排序，保证与入参顺序一致
	items := parsed.Output.Embeddings
	for i := 1; i < len(items); i++ {
		for j := i; j > 0 && items[j].TextIndex < items[j-1].TextIndex; j-- {
			items[j], items[j-1] = items[j-1], items[j]
		}
	}
	out := make([][]float64, 0, len(items))
	for _, e := range items {
		out = append(out, e.Embedding)
	}
	return out, nil
}

/* ── 批注审阅 ── */

// AiSuggestionResult LLM 对一条内容的判断。
type AiSuggestionResult struct {
	SuggestionType string `json:"suggestionType"`
	Priority       string `json:"priority"`
	Title          string `json:"title"`
	Reason         string `json:"reason"`
	TokenUsage     int    `json:"-"`
}

const reviewSystemPrompt = `你是一位专业的乐谱审阅助手，精通简谱记谱法和音乐理论。
请分析用户提交的审阅建议，输出 JSON 格式结果：

{
  "suggestion_type": "auto_accept | auto_reject | discuss | info",
  "priority": "P0 | P1 | P2",
  "title": "简短的标题",
  "reason": "判断理由"
}

分类规则：
- auto_accept：明确的错误修正（如错音、错拍号、错调号）
- auto_reject：无意义或错误的内容
- discuss：需要人工讨论的修改建议
- info：仅信息提示，无需处理

优先级：
- P0 紧急：节拍错误、音域超限、和声冲突、调号/拍号错误
- P1 建议：表情记号、力度微调、速度标记建议
- P2 可忽略：格式微调、排版调整、措辞建议`

// jsonBlockRe 等价于 JS 的 /\{[\s\S]*\}/。
// Go 的 `.` 默认不匹配换行，必须加 (?s) 标志。
var jsonBlockRe = regexp.MustCompile(`(?s)\{.*\}`)

// ReviewAnalyze 调用 LLM 分析一条审阅内容。
func (c *DashScopeClient) ReviewAnalyze(ctx context.Context, content, ragContext string) (AiSuggestionResult, error) {
	userPrompt := "【待分析内容】\n" + content
	if ragContext != "" {
		userPrompt = "【参考上下文】\n" + ragContext + "\n\n" + userPrompt
	}

	reply, tokens, err := c.generate(ctx, reviewSystemPrompt, userPrompt, 0.3)
	if err != nil {
		return AiSuggestionResult{}, err
	}

	if block := jsonBlockRe.FindString(reply); block != "" {
		var parsed struct {
			SuggestionType string `json:"suggestion_type"`
			Priority       string `json:"priority"`
			Title          string `json:"title"`
			Reason         string `json:"reason"`
		}
		if err := json.Unmarshal([]byte(block), &parsed); err == nil {
			title := parsed.Title
			if title == "" {
				title = "AI 审阅建议"
			}
			reason := parsed.Reason
			if reason == "" {
				reason = "AI 分析完成"
			}
			return AiSuggestionResult{
				SuggestionType: validateSuggestionType(parsed.SuggestionType),
				Priority:       validatePriority(parsed.Priority),
				Title:          title,
				Reason:         reason,
				TokenUsage:     tokens,
			}, nil
		}
	}

	// JSON 解析失败 → 回退为纯文本（截断 500 字符）
	return AiSuggestionResult{
		SuggestionType: "discuss",
		Priority:       "P2",
		Title:          "AI 审阅建议",
		Reason:         truncateRunes(reply, 500),
		TokenUsage:     tokens,
	}, nil
}

// reviewMaxRetries 与 Node 的 MAX_RETRIES = 1 一致（共 2 次尝试）。
const reviewMaxRetries = 1

// ReviewWithFallback 带重试的 AI 分析；最终失败时降级为 discuss + P2，**不阻塞业务**。
func (c *DashScopeClient) ReviewWithFallback(ctx context.Context, content, ragContext string) AiSuggestionResult {
	var lastErr error
	for attempt := 0; attempt <= reviewMaxRetries; attempt++ {
		result, err := c.ReviewAnalyze(ctx, content, ragContext)
		if err == nil {
			return result
		}
		lastErr = err
	}
	return AiSuggestionResult{
		SuggestionType: "discuss",
		Priority:       "P2",
		Title:          "AI 暂不可用",
		Reason:         "AI 服务调用失败：" + errText(lastErr) + "。已降级为人工讨论。",
	}
}

func errText(err error) string {
	if err == nil {
		return "未知错误"
	}
	return err.Error()
}

func validateSuggestionType(t string) string {
	switch t {
	case "auto_accept", "auto_reject", "discuss", "info":
		return t
	}
	return "discuss"
}

func validatePriority(p string) string {
	switch p {
	case "P0", "P1", "P2":
		return p
	}
	return "P2"
}

/* ── 合并冲突建议 ── */

// MergeSuggestionResult 合并冲突的 AI 建议。
type MergeSuggestionResult struct {
	Resolution     string `json:"resolution"`
	SuggestionText string `json:"suggestion_text"`
}

const mergeSystemPrompt = `你是乐谱合并冲突分析专家。给定主库与分支的冲突描述，判断应采用哪一方，并给出理由。

输出 JSON 格式：
{
  "resolution": "accept_main | accept_branch | custom",
  "suggestion_text": "给用户的合并建议"
}

判断规则（按优先级）：
1. 若提供了【相关记谱规范】，必须以其为依据判断，并在建议中点明引用的条款号（如"依据 §5.2.1 小节线"）
2. 音高、时值等记谱错误，优先接受正确的一方
3. 风格性修改需权衡，说明倾向哪一方及原因
4. 调号、拍号等重大变更，建议人工确认

注意：若提供的规范与本次冲突无关，不要强行引用，按记谱常识判断即可。`

// ragEnabledTypes 值得检索规范的冲突类型。
// tempo / metadata 属艺术性或元数据分歧，规范里没有客观判据，检索只会注入噪音。
var ragEnabledTypes = map[string]bool{
	"structural":     true, // 时值不符合拍号——规范性最强
	"time_signature": true,
	"key_signature":  true,
	"note_content":   true,
}

// ragMinScoreForMerge 相关性阈值，低于此分的规则视为噪音。
//
// ⚠ 实测（关键词路径，知识库 567 条）：相关规则落在 11~25，弱相关也在 11~13，
// 区间重叠，无法用阈值干净切分。此处取 8 与既有 ragFilter 口径一致，
// 宁可放宽、由 prompt 指令要求 LLM 对无关条款不予引用。
const ragMinScoreForMerge = 8

// GenerateMergeSuggestion 生成合并冲突建议。
//
// 三段式：算法查差异（上游 DetectConflicts）→ 检索查规范依据 → LLM 组织语言。
// 与 Node 版相比新增了第二段（检索）；检索失败时降级为无依据，不阻塞。
func (c *DashScopeClient) GenerateMergeSuggestion(
	ctx context.Context, kb *rules.KnowledgeBase, params MergeParams,
) *MergeSuggestionResult {
	if !c.HasKey() {
		return nil
	}

	rulesContext := ""
	if ragEnabledTypes[params.ConflictType] && kb != nil {
		if matches := kb.SearchKeyword(params.ConflictDetail, 3); len(matches) > 0 {
			parts := make([]string, 0, len(matches))
			for _, m := range matches {
				if m.Score >= ragMinScoreForMerge {
					parts = append(parts, "§"+m.Entry.SectionID+" "+m.Entry.Title+"："+m.Entry.Description)
				}
			}
			rulesContext = strings.Join(parts, "\n")
		}
	}

	lines := []string{
		"【冲突描述】" + params.ConflictDetail,
		"【主库当前值】" + params.MainValue,
		"【分支新值】" + params.BranchValue,
	}
	if rulesContext != "" {
		lines = append(lines, "【相关记谱规范（请据此判断，并说明引用条款）】\n"+rulesContext)
	}
	userPrompt := strings.Join(lines, "\n")

	reply, _, err := c.generate(ctx, mergeSystemPrompt, userPrompt, 0.2)
	if err != nil {
		return nil
	}

	block := jsonBlockRe.FindString(reply)
	if block == "" {
		return nil
	}
	var parsed struct {
		Resolution     string `json:"resolution"`
		SuggestionText string `json:"suggestion_text"`
	}
	if err := json.Unmarshal([]byte(block), &parsed); err != nil {
		return nil
	}

	resolution := "custom"
	switch parsed.Resolution {
	case "accept_main", "accept_branch", "custom":
		resolution = parsed.Resolution
	}
	text := parsed.SuggestionText
	if text == "" {
		text = "AI 建议人工确认"
	}
	return &MergeSuggestionResult{Resolution: resolution, SuggestionText: text}
}

// MergeParams 合并建议入参。
type MergeParams struct {
	ConflictDetail string
	MainValue      string
	BranchValue    string
	ConflictType   string
}
