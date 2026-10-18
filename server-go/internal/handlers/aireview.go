package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"

	"score-review/server-go/internal/httpx"
	"score-review/server-go/internal/services"
)

// suggestionWithID 是 `{...AnalyzeResult, id}` 的序列化形态（id 在最后）。
type suggestionWithID struct {
	Passed         bool    `json:"passed"`
	Layer          string  `json:"layer"`
	SuggestionType string  `json:"suggestionType"`
	Priority       string  `json:"priority"`
	Title          string  `json:"title"`
	Reason         string  `json:"reason"`
	RagContext     *string `json:"ragContext,omitempty"`
	ID             int64   `json:"id"`
}

// branchSuggestion 额外带乐段信息。
type branchSuggestion struct {
	suggestionWithID
	SectionID   int     `json:"section_id"`
	SectionName *string `json:"section_name"`
}

type analyzeResponse struct {
	Suggestion suggestionWithID `json:"suggestion"`
}

type branchAnalyzeResponse struct {
	Suggestions []branchSuggestion `json:"suggestions"`
	Message     string             `json:"message,omitempty"`
}

// AnalyzeSubmission POST /api/ai-review/analyze —— 单条提交走三层过滤
func (h *Handler) AnalyzeSubmission(c *gin.Context) {
	var body struct {
		ScoreID   *int    `json:"score_id"`
		SectionID *int    `json:"section_id"`
		BranchID  *int    `json:"branch_id"`
		Content   *string `json:"content"`
		Title     *string `json:"title"`
		UserID    *int    `json:"user_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "参数不完整（需要 score_id 和 content）")
		return
	}
	if body.ScoreID == nil || body.Content == nil || *body.Content == "" {
		httpx.Fail(c, http.StatusBadRequest, "参数不完整（需要 score_id 和 content）")
		return
	}

	userID := 1
	if body.UserID != nil {
		userID = *body.UserID
	}

	ctx := c.Request.Context()
	input := services.AnalyzeInput{
		ScoreID: *body.ScoreID, SectionID: body.SectionID, BranchID: body.BranchID,
		Content: *body.Content, Title: body.Title, UserID: &userID,
	}

	result := h.App.AIReview.AnalyzeSubmission(ctx, input)
	suggestionID, err := h.App.AIReview.SaveSuggestion(ctx, input, result, result.RagContext)
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	httpx.OK(c, analyzeResponse{Suggestion: toSuggestionWithID(result, suggestionID)})
}

// branchOverrideItem 分支改动的查询结果。
type branchOverrideItem struct {
	SectionID   int     `db:"section_id"`
	ScoreID     int     `db:"score_id"`
	Content     *string `db:"content"`
	SectionName *string `db:"section_name"`
}

// AnalyzeBranch POST /api/ai-review/branch/:branchId —— 分析分支全部改动
func (h *Handler) AnalyzeBranch(c *gin.Context) {
	var body struct {
		UserID *int `json:"user_id"`
	}
	_ = c.ShouldBindJSON(&body)
	userID := 1
	if body.UserID != nil {
		userID = *body.UserID
	}

	ctx := c.Request.Context()
	branchID := intParam(c.Param("branchId"))

	items := make([]branchOverrideItem, 0)
	if err := h.App.DB.SelectContext(ctx, &items,
		`SELECT bo.section_id, s.score_id, bo.content, s.name as section_name
		 FROM branch_overrides bo
		 JOIN sections s ON bo.section_id = s.id
		 WHERE bo.branch_id = ?`, branchID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	if len(items) == 0 {
		// Node 在无改动时返回带 message 的对象
		httpx.OK(c, branchAnalyzeResponse{Suggestions: []branchSuggestion{}, Message: "该分支无修改记录"})
		return
	}

	suggestions := make([]branchSuggestion, 0, len(items))
	for _, item := range items {
		content := ""
		if item.Content != nil {
			content = *item.Content
		}
		if content == "" {
			continue
		}

		title := "乐段「" + strOr(item.SectionName, "") + "」修改分析"
		input := services.AnalyzeInput{
			ScoreID: item.ScoreID, BranchID: &branchID, SectionID: &item.SectionID,
			Content: content, Title: &title, UserID: &userID,
		}

		result := h.App.AIReview.AnalyzeSubmission(ctx, input)
		id, err := h.App.AIReview.SaveSuggestion(ctx, input, result, result.RagContext)
		if err != nil {
			httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
			return
		}

		suggestions = append(suggestions, branchSuggestion{
			suggestionWithID: toSuggestionWithID(result, id),
			SectionID:        item.SectionID,
			SectionName:      item.SectionName,
		})
	}

	httpx.OK(c, branchAnalyzeResponse{Suggestions: suggestions})
}

// ReviewSuggestionRow 对应 review_suggestions 表 + JOIN 出的 reviewed_by_name。
type ReviewSuggestionRow struct {
	ID            int          `json:"id" db:"id"`
	ScoreID       int          `json:"score_id" db:"score_id"`
	BranchID      *int         `json:"branch_id" db:"branch_id"`
	SectionID     *int         `json:"section_id" db:"section_id"`
	Layer         string       `json:"layer" db:"layer"`
	SuggestionType string      `json:"suggestion_type" db:"suggestion_type"`
	Priority      string       `json:"priority" db:"priority"`
	Title         string       `json:"title" db:"title"`
	Content       *string      `json:"content" db:"content"`
	Reason        *string      `json:"reason" db:"reason"`
	RagContext    *string      `json:"rag_context" db:"rag_context"`
	TokenUsage    int          `json:"token_usage" db:"token_usage"`
	Model         *string      `json:"model" db:"model"`
	Status        string       `json:"status" db:"status"`
	CreatedBy     *int         `json:"created_by" db:"created_by"`
	ReviewedBy    *int         `json:"reviewed_by" db:"reviewed_by"`
	ReviewedAt    httpx.NullJSTime `json:"reviewed_at" db:"reviewed_at"`
	CreatedAt     httpx.JSTime `json:"created_at" db:"created_at"`
	ReviewedByName *string     `json:"reviewed_by_name" db:"reviewed_by_name"`
}

type suggestionsResponse struct {
	Suggestions []ReviewSuggestionRow `json:"suggestions"`
}

// GetSuggestions GET /api/ai-review/suggestions/:scoreId
func (h *Handler) GetSuggestions(c *gin.Context) {
	ctx := c.Request.Context()
	status := c.Query("status")
	priority := c.Query("priority")

	sql := `SELECT rs.*, u.name as reviewed_by_name
	        FROM review_suggestions rs
	        LEFT JOIN users u ON rs.reviewed_by = u.id
	        WHERE rs.score_id = ?`
	params := []any{intParam(c.Param("scoreId"))}

	if status != "" && status != "all" {
		sql += " AND rs.status = ?"
		params = append(params, status)
	}
	if priority != "" && priority != "all" {
		sql += " AND rs.priority = ?"
		params = append(params, priority)
	}
	sql += ` ORDER BY FIELD(rs.priority, "P0", "P1", "P2"), rs.created_at DESC`

	rows := make([]ReviewSuggestionRow, 0)
	if err := h.App.DB.SelectContext(ctx, &rows, sql, params...); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	httpx.OK(c, suggestionsResponse{Suggestions: rows})
}

// UpdateSuggestionStatus PUT /api/ai-review/suggestions/:id/status
func (h *Handler) UpdateSuggestionStatus(c *gin.Context) {
	var body struct {
		Status     *string `json:"status"`
		ReviewedBy *int    `json:"reviewed_by"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "状态值无效（accepted/rejected/dismissed）")
		return
	}
	if body.Status == nil ||
		(*body.Status != "accepted" && *body.Status != "rejected" && *body.Status != "dismissed") {
		httpx.Fail(c, http.StatusBadRequest, "状态值无效（accepted/rejected/dismissed）")
		return
	}

	ctx := c.Request.Context()
	if _, err := h.App.DB.ExecContext(ctx,
		"UPDATE review_suggestions SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
		*body.Status, body.ReviewedBy, intParam(c.Param("id"))); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	// 接受建议 → 累加偏好权重（失败不阻塞）
	if *body.Status == "accepted" {
		userID := 1
		if body.ReviewedBy != nil {
			userID = *body.ReviewedBy
		}
		value, _ := json.Marshal(map[string]any{"pattern": "user_accepted", "count": 1})
		if _, err := h.App.DB.ExecContext(ctx,
			`INSERT INTO user_preferences (user_id, preference_key, preference_value, weight)
			 VALUES (?, ?, ?, 1.0)
			 ON DUPLICATE KEY UPDATE weight = weight + 0.1`,
			userID, "accepted_patterns", string(value)); err != nil {
			// 偏好记录失败不阻塞
		}
	}

	httpx.OK(c, messageResponse{Message: "审阅状态已更新"})
}

/* ── 工具 ── */

func toSuggestionWithID(r services.AnalyzeResult, id int64) suggestionWithID {
	return suggestionWithID{
		Passed: r.Passed, Layer: r.Layer, SuggestionType: r.SuggestionType,
		Priority: r.Priority, Title: r.Title, Reason: r.Reason,
		RagContext: r.RagContext, ID: id,
	}
}

func strOr(s *string, fallback string) string {
	if s == nil {
		return fallback
	}
	return *s
}
