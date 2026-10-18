package services

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/jmoiron/sqlx"

	"score-review/server-go/internal/rules"
)

// AnalyzeInput 一次分析请求。
type AnalyzeInput struct {
	ScoreID   int
	BranchID  *int
	SectionID *int
	Content   string
	Title     *string
	UserID    *int
}

// AnalyzeResult 三层流水线的最终结论。
type AnalyzeResult struct {
	Passed         bool    `json:"passed"`
	Layer          string  `json:"layer"`
	SuggestionType string  `json:"suggestionType"`
	Priority       string  `json:"priority"`
	Title          string  `json:"title"`
	Reason         string  `json:"reason"`
	RagContext     *string `json:"ragContext,omitempty"`

	// 供 saveSuggestion 落库用（Node 版因类型未声明而丢失，属既有 bug，此处修好）
	TokenUsage int    `json:"-"`
	Model      string `json:"-"`
}

// AIReviewService 编排三层过滤：偏好预判 → 规则层 → RAG 层 → LLM。
//
// 任一层拦截即返回，只有前三层都通过才会真正调用 LLM。
type AIReviewService struct {
	DB     *sqlx.DB
	KB     *rules.KnowledgeBase
	Client *DashScopeClient
}

// NewAIReviewService 创建服务。
func NewAIReviewService(db *sqlx.DB, kb *rules.KnowledgeBase, client *DashScopeClient) *AIReviewService {
	return &AIReviewService{DB: db, KB: kb, Client: client}
}

// AnalyzeSubmission 运行三层过滤流水线，行为对齐 TS 版 analyzeSubmission。
func (s *AIReviewService) AnalyzeSubmission(ctx context.Context, input AnalyzeInput) AnalyzeResult {
	userID := 1
	if input.UserID != nil {
		userID = *input.UserID
	}
	titleOr := func(fallback string) string {
		if input.Title != nil && *input.Title != "" {
			return *input.Title
		}
		return fallback
	}

	// ── Layer 0：偏好预判（用户历史驳回模式）──
	var prefRows []struct {
		PreferenceValue json.RawMessage `db:"preference_value"`
	}
	err := s.DB.SelectContext(ctx, &prefRows,
		"SELECT preference_value FROM user_preferences WHERE user_id = ? AND preference_key = 'rejected_patterns'",
		userID)
	if err == nil && len(prefRows) > 0 {
		// MySQL 的 JSON 列可能返回对象，也可能因写入方式返回字符串，两种都兼容
		patterns := parsePatterns(prefRows[0].PreferenceValue)
		if ShouldAutoReject(input.Content, patterns) {
			return AnalyzeResult{
				Passed: false, Layer: "rule", SuggestionType: "auto_reject", Priority: "P2",
				Title:  titleOr("偏好模式自动拦截"),
				Reason: "该内容与您此前多次驳回的模式匹配，已自动拦截",
			}
		}
	}

	// ── Layer 1：规则过滤 ──
	ruleResult := RuleFilter(input.Content)
	if !ruleResult.Passed {
		suggestionType := ruleResult.SuggestionType
		if suggestionType == "" {
			suggestionType = "auto_reject"
		}
		reason := ruleResult.Reason
		if reason == "" {
			reason = "未通过规则检查"
		}
		return AnalyzeResult{
			Passed: false, Layer: "rule", SuggestionType: suggestionType, Priority: "P2",
			Title: titleOr("规则层自动驳回"), Reason: reason,
		}
	}

	// ── Layer 2：RAG 规则知识库匹配 ──
	ragResult := RagFilter(s.KB, input.Content)
	if !ragResult.Passed {
		reason := ragResult.Reason
		if reason == "" {
			reason = "内容与简谱记谱规范无关联"
		}
		return AnalyzeResult{
			Passed: false, Layer: "rag", SuggestionType: "auto_reject", Priority: "P2",
			Title: titleOr("RAG 规则库未匹配"), Reason: reason,
		}
	}

	// ── Layer 3：LLM（前两层都通过才会走到这里）──
	// ReviewWithFallback 内部已兜底，不会返回错误；下面的 else 分支在
	// Node 版中是死代码，此处保留同样结构以便对照。
	aiResult := s.Client.ReviewWithFallback(ctx, input.Content, ragResult.Context)
	ragCtx := ragResult.Context
	finalTitle := aiResult.Title
	if finalTitle == "" {
		finalTitle = titleOr("AI 审阅建议")
	}
	model := DashScopeModel
	return AnalyzeResult{
		Passed: true, Layer: "ai",
		SuggestionType: aiResult.SuggestionType, Priority: aiResult.Priority,
		Title: finalTitle, Reason: aiResult.Reason, RagContext: &ragCtx,
		TokenUsage: aiResult.TokenUsage, Model: model,
	}
}

// SaveSuggestion 把分析结果写入 review_suggestions，返回自增 id。
func (s *AIReviewService) SaveSuggestion(
	ctx context.Context, input AnalyzeInput, result AnalyzeResult, ragContext *string,
) (int64, error) {
	userID := 1
	if input.UserID != nil {
		userID = *input.UserID
	}

	// token 用量只在 LLM 层有意义，其余层记 0
	tokenUsage := 0
	var model *string
	if result.Layer == "ai" {
		tokenUsage = result.TokenUsage
		m := result.Model
		if m == "" {
			m = DashScopeModel
		}
		model = &m
	}

	res, err := s.DB.ExecContext(ctx,
		`INSERT INTO review_suggestions (score_id, branch_id, section_id, layer, suggestion_type, priority, title, content, reason, rag_context, token_usage, model, status, created_by)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
		input.ScoreID, input.BranchID, input.SectionID, result.Layer,
		result.SuggestionType, result.Priority, result.Title, input.Content,
		result.Reason, ragContext, tokenUsage, model, userID)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// parsePatterns 兼容 preference_value 是 JSON 数组或 JSON 字符串两种形态。
// Node 对应 `typeof raw === 'string' ? JSON.parse(raw) : raw`。
func parsePatterns(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return nil
	}

	// 形态一：直接是数组
	var direct []string
	if err := json.Unmarshal(raw, &direct); err == nil {
		return direct
	}

	// 形态二：是字符串，内容才是 JSON 数组（Node 会再 JSON.parse 一次）
	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		var nested []string
		if err := json.Unmarshal([]byte(asString), &nested); err == nil {
			return nested
		}
	}

	slog.Debug("preference_value 无法解析为模式数组，按空处理")
	return nil
}
