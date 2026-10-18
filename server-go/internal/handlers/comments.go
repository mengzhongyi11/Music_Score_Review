package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"score-review/server-go/internal/database"
	"score-review/server-go/internal/httpx"
	"score-review/server-go/internal/middleware"
	"score-review/server-go/internal/models"
	"score-review/server-go/internal/services"
)

// byScoreCommentRow 是 /comments/by-score 的行（多了乐谱名与审阅状态）。
type byScoreCommentRow struct {
	ID           int          `json:"id" db:"id"`
	SectionID    int          `json:"section_id" db:"section_id"`
	UserID       int          `json:"user_id" db:"user_id"`
	Author       string       `json:"author" db:"author"`
	Content      string       `json:"content" db:"content"`
	Status       string       `json:"status" db:"status"`
	MeasureRef   *string      `json:"measure_ref" db:"measure_ref"`
	CreatedAt    httpx.JSTime `json:"created_at" db:"created_at"`
	ScoreName    string       `json:"score_name" db:"score_name"`
	ScoreID      int          `json:"score_id" db:"score_id"`
	ReviewStatus string       `json:"review_status" db:"review_status"`
}

// GetCommentsBySection GET /api/comments/section/:sectionId
func (h *Handler) GetCommentsBySection(c *gin.Context) {
	rows := make([]models.CommentRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		`SELECT c.*, u.avatar, u.role as user_role, u.title as user_title
		 FROM comments c
		 LEFT JOIN users u ON c.user_id = u.id
		 WHERE c.section_id = ?
		 ORDER BY c.created_at DESC`, intParam(c.Param("sectionId")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.List(c, rows)
}

// GetAllCommentsByScore GET /api/comments/by-score
func (h *Handler) GetAllCommentsByScore(c *gin.Context) {
	rows := make([]byScoreCommentRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		`SELECT c.id, c.section_id, c.user_id, c.author, c.content, c.status, c.measure_ref, c.created_at,
		        s.name as score_name, s.id as score_id, s.review_status
		 FROM comments c
		 JOIN sections sec ON c.section_id = sec.id
		 JOIN scores s ON sec.score_id = s.id
		 ORDER BY c.created_at DESC`)
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	httpx.List(c, rows)
}

/* ── 创建批注 ── */

// AiSuggestionPayload 返回给前端的 AI 初审结果（TS 里是 `{id, ...result}`）。
type AiSuggestionPayload struct {
	ID             *int64  `json:"id"`
	Passed         bool    `json:"passed"`
	Layer          string  `json:"layer"`
	SuggestionType string  `json:"suggestionType"`
	Priority       string  `json:"priority"`
	Title          string  `json:"title"`
	Reason         string  `json:"reason"`
	RagContext     *string `json:"ragContext,omitempty"`
}

// createCommentResponse 字段顺序与 Node 版字面量一致。
type createCommentResponse struct {
	ID           int64                `json:"id"`
	SectionID    int                  `json:"section_id"`
	UserID       int                  `json:"user_id"`
	Author       string               `json:"author"`
	Avatar       *string              `json:"avatar"`
	UserRole     *string              `json:"user_role"`
	UserTitle    *string              `json:"user_title"`
	Content      string               `json:"content"`
	Status       string               `json:"status"`
	MeasureRef   *string              `json:"measure_ref"`
	CreatedAt    string               `json:"created_at"`
	Message      string               `json:"message"`
	AISuggestion *AiSuggestionPayload `json:"ai_suggestion"`
}

// aiFilteredResponse AI 拦截时的响应体。
type aiFilteredResponse struct {
	Message      string               `json:"message"`
	Filtered     bool                 `json:"filtered"`
	AISuggestion *AiSuggestionPayload `json:"ai_suggestion"`
}

// CreateComment POST /api/comments —— 先 AI 三层过滤，通过后再落库
func (h *Handler) CreateComment(c *gin.Context) {
	// ① 参数校验（对应 Node 的 zod schemas.comment）
	var body struct {
		SectionID  *int    `json:"section_id"`
		Content    string  `json:"content"`
		MeasureRef *string `json:"measure_ref"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "参数校验失败")
		return
	}
	if errs := validateCommentBody(body.SectionID, body.Content); len(errs) > 0 {
		c.PureJSON(http.StatusBadRequest, gin.H{"message": "参数校验失败", "errors": errs})
		return
	}

	user, ok := middleware.CurrentUser(c)
	if !ok {
		httpx.Fail(c, http.StatusUnauthorized, "未登录或 token 缺失")
		return
	}
	ctx := c.Request.Context()
	sectionID := *body.SectionID

	// ② 查用户信息
	var userInfo struct {
		Name   string  `db:"name"`
		Avatar *string `db:"avatar"`
		Role   *string `db:"role"`
		Title  *string `db:"title"`
	}
	if err := h.App.DB.GetContext(ctx, &userInfo,
		"SELECT name, avatar, role, title FROM users WHERE id = ?", user.ID); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "用户不存在")
		return
	}

	// ③ 查所属乐谱
	var scoreID *int
	if err := h.App.DB.GetContext(ctx, &scoreID,
		"SELECT score_id FROM sections WHERE id = ?", sectionID); err != nil {
		scoreID = nil
	}

	// ④ AI 预审（三层过滤）；标题截断规则与 Node 一致
	analysisTitle := "批注分析：" + truncateRunes(body.Content, 30)
	if len([]rune(body.Content)) > 30 {
		analysisTitle += "…"
	}

	var aiSuggestion *AiSuggestionPayload
	if scoreID != nil {
		result := h.App.AIReview.AnalyzeSubmission(ctx, services.AnalyzeInput{
			ScoreID: *scoreID, SectionID: &sectionID, Content: body.Content,
			Title: &analysisTitle, UserID: &user.ID,
		})

		// 规则层或 RAG 层驳回 → 拦截，不创建批注
		if result.SuggestionType == "auto_reject" {
			c.PureJSON(http.StatusBadRequest, aiFilteredResponse{
				Message:  "AI 过滤已拦截：" + result.Reason,
				Filtered: true,
				AISuggestion: &AiSuggestionPayload{
					ID: nil, Passed: result.Passed, Layer: result.Layer,
					SuggestionType: result.SuggestionType, Priority: result.Priority,
					Title: result.Title, Reason: result.Reason, RagContext: result.RagContext,
				},
			})
			return
		}

		// 通过预审 → 保存建议供后续查看
		sugID, err := h.App.AIReview.SaveSuggestion(ctx,
			services.AnalyzeInput{
				ScoreID: *scoreID, SectionID: &sectionID, Content: body.Content,
				Title: &analysisTitle, UserID: &user.ID,
			}, result, result.RagContext)
		if err == nil {
			aiSuggestion = &AiSuggestionPayload{
				ID: &sugID, Passed: result.Passed, Layer: result.Layer,
				SuggestionType: result.SuggestionType, Priority: result.Priority,
				Title: result.Title, Reason: result.Reason, RagContext: result.RagContext,
			}
		}
		// AI 分析/落库失败不阻塞批注创建（与 Node 的 try/catch 一致）
	}

	// ⑤ 落库：事务覆盖「插入批注 + 置乐谱为待审」
	//    缺陷修复：Node 版这两步是两次独立写且无事务。
	var commentID int64
	err := database.WithTx(ctx, h.App.DB, func(tx *sqlx.Tx) error {
		res, err := tx.ExecContext(ctx,
			"INSERT INTO comments (section_id, user_id, author, content, status, measure_ref) VALUES (?, ?, ?, ?, ?, ?)",
			sectionID, user.ID, userInfo.Name, body.Content, "open", body.MeasureRef)
		if err != nil {
			return err
		}
		commentID, _ = res.LastInsertId()

		_, err = tx.ExecContext(ctx,
			`UPDATE scores SET review_status = 'pending'
			 WHERE id = (SELECT score_id FROM sections WHERE id = ?)
			 AND review_status NOT IN ('approved','rejected')`, sectionID)
		return err
	})
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	services.Del(ctx, h.App.Cache, "scores:list:*") // 批注数变化 → 失效列表缓存

	c.PureJSON(http.StatusCreated, createCommentResponse{
		ID: commentID, SectionID: sectionID, UserID: user.ID,
		Author: userInfo.Name, Avatar: userInfo.Avatar,
		UserRole: userInfo.Role, UserTitle: userInfo.Title,
		Content: body.Content, Status: "open", MeasureRef: body.MeasureRef,
		CreatedAt: httpx.NowISO(), Message: "评论发表成功",
		AISuggestion: aiSuggestion,
	})
}

// UpdateCommentStatus PUT /api/comments/:id/status
func (h *Handler) UpdateCommentStatus(c *gin.Context) {
	var body struct {
		Status *string `json:"status"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "状态值无效")
		return
	}
	if body.Status == nil || (*body.Status != "open" && *body.Status != "resolved") {
		httpx.Fail(c, http.StatusBadRequest, "状态值无效")
		return
	}

	ctx := c.Request.Context()
	commentID := intParam(c.Param("id"))

	if _, err := h.App.DB.ExecContext(ctx,
		"UPDATE comments SET status = ? WHERE id = ?", *body.Status, commentID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	// 全部批注都已解决 → 乐谱从「工作中」转为「已通过」
	if *body.Status == "resolved" {
		var openCount int
		err := h.App.DB.GetContext(ctx, &openCount,
			`SELECT COUNT(*) as cnt FROM comments c
			 JOIN sections sec ON c.section_id = sec.id
			 WHERE sec.score_id = (SELECT score_id FROM sections WHERE id = (SELECT section_id FROM comments WHERE id = ?))
			 AND c.status = 'open'`, commentID)
		if err == nil && openCount == 0 {
			if _, err := h.App.DB.ExecContext(ctx,
				`UPDATE scores SET review_status = 'approved' WHERE id = (
				   SELECT score_id FROM sections WHERE id = (SELECT section_id FROM comments WHERE id = ?)
				 ) AND review_status = 'working'`, commentID); err != nil {
				httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
				return
			}
		}
	}

	httpx.OK(c, messageResponse{Message: "状态更新成功"})
}

// DeleteComment DELETE /api/comments/:id
func (h *Handler) DeleteComment(c *gin.Context) {
	if _, err := h.App.DB.ExecContext(c.Request.Context(),
		"DELETE FROM comments WHERE id = ?", intParam(c.Param("id"))); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.OK(c, messageResponse{Message: "删除成功"})
}

/* ── 校验辅助 ── */

type fieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// validateCommentBody 复刻 zod 的 schemas.comment：
// section_id 必须为正整数；content 长度 1~2000。
func validateCommentBody(sectionID *int, content string) []fieldError {
	errs := make([]fieldError, 0, 2)
	if sectionID == nil || *sectionID <= 0 {
		errs = append(errs, fieldError{Field: "section_id", Message: "section_id 必须是正整数"})
	}
	n := len([]rune(content))
	if n < 1 {
		errs = append(errs, fieldError{Field: "content", Message: "content 不能为空"})
	} else if n > 2000 {
		errs = append(errs, fieldError{Field: "content", Message: "content 长度不能超过 2000"})
	}
	return errs
}

// truncateRunes 按字符数截断（复刻 JS slice）。
func truncateRunes(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n])
}
