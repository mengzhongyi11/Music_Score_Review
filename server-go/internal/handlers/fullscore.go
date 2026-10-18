package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"score-review/server-go/internal/httpx"
	"score-review/server-go/internal/models"
)

// FullScoreSection 是 sections 行 + 由子查询带出的「上一版本」信息。
type FullScoreSection struct {
	models.SectionRow
	VersionCount      int     `json:"version_count" db:"version_count"`
	PrevContent       *string `json:"prev_content" db:"prev_content"`
	PrevName          *string `json:"prev_name" db:"prev_name"`
	PrevTempo         *string `json:"prev_tempo" db:"prev_tempo"`
	PrevKeySignature  *string `json:"prev_key_signature" db:"prev_key_signature"`
	PrevTimeSignature *string `json:"prev_time_signature" db:"prev_time_signature"`
}

type fullScoreResponse struct {
	// 用 ScoreBaseRow 而非 ScoreRow：此处是 SELECT * FROM scores，
	// 响应里不应出现 owner_name / owner_avatar
	Score    models.ScoreBaseRow  `json:"score"`
	Sections []FullScoreSection   `json:"sections"`
	Comments []models.CommentRow  `json:"comments"`
}

// GetFullScore GET /api/scores/:id/full-score
//
// 注意：该路由在 Node 版是 fullscoreRouter 挂在 `/api` 根上（不是 /api/fullscore），
// 所以注册时也直接挂到 /api 组下。
func (h *Handler) GetFullScore(c *gin.Context) {
	ctx := c.Request.Context()
	scoreID := intParam(c.Param("id"))

	// ① 乐谱
	scoreRows := make([]models.ScoreBaseRow, 0)
	if err := h.App.DB.SelectContext(ctx, &scoreRows,
		"SELECT * FROM scores WHERE id = ?", scoreID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	if len(scoreRows) == 0 {
		httpx.Fail(c, http.StatusNotFound, "未找到该乐谱")
		return
	}

	// ② 全部乐段（含版本数与上一版六个字段）
	sections := make([]FullScoreSection, 0)
	if err := h.App.DB.SelectContext(ctx, &sections,
		`SELECT s.*,
		   (SELECT COUNT(*) FROM section_versions sv WHERE sv.section_id = s.id) as version_count,
		   (SELECT content FROM section_versions sv WHERE sv.section_id = s.id ORDER BY sv.created_at DESC LIMIT 1) as prev_content,
		   (SELECT name FROM section_versions sv WHERE sv.section_id = s.id ORDER BY sv.created_at DESC LIMIT 1) as prev_name,
		   (SELECT tempo FROM section_versions sv WHERE sv.section_id = s.id ORDER BY sv.created_at DESC LIMIT 1) as prev_tempo,
		   (SELECT key_signature FROM section_versions sv WHERE sv.section_id = s.id ORDER BY sv.created_at DESC LIMIT 1) as prev_key_signature,
		   (SELECT time_signature FROM section_versions sv WHERE sv.section_id = s.id ORDER BY sv.created_at DESC LIMIT 1) as prev_time_signature
		 FROM sections s
		 WHERE s.score_id = ?
		 ORDER BY s.sort_order, s.id`, scoreID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	// ③ 全部相关评论
	comments := make([]models.CommentRow, 0)
	if err := h.App.DB.SelectContext(ctx, &comments,
		`SELECT c.*, u.avatar, u.role as user_role
		 FROM comments c
		 LEFT JOIN users u ON c.user_id = u.id
		 WHERE c.section_id IN (SELECT id FROM sections WHERE score_id = ?)
		 ORDER BY c.created_at DESC`, scoreID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	httpx.OK(c, fullScoreResponse{
		Score: scoreRows[0], Sections: sections, Comments: comments,
	})
}
