package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"score-review/server-go/internal/httpx"
)

// CollaboratorRow 对应 score_collaborators 表 + JOIN 出的用户信息。
type CollaboratorRow struct {
	ID            int          `json:"id" db:"id"`
	ScoreID       int          `json:"score_id" db:"score_id"`
	UserID        int          `json:"user_id" db:"user_id"`
	Role          string       `json:"role" db:"role"`
	InvitedBy     *int         `json:"invited_by" db:"invited_by"`
	CreatedAt     httpx.JSTime `json:"created_at" db:"created_at"`
	Name          string       `json:"name" db:"name"`
	Avatar        *string      `json:"avatar" db:"avatar"`
	UserRole      *string      `json:"user_role" db:"user_role"`
	Title         *string      `json:"title" db:"title"`
	InvitedByName *string      `json:"invited_by_name" db:"invited_by_name"`
}

// GetCollaborators GET /api/collaborators/score/:scoreId
func (h *Handler) GetCollaborators(c *gin.Context) {
	rows := make([]CollaboratorRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		`SELECT sc.*, u.name, u.avatar, u.role as user_role, u.title,
		        inv.name as invited_by_name
		 FROM score_collaborators sc
		 JOIN users u ON sc.user_id = u.id
		 LEFT JOIN users inv ON sc.invited_by = inv.id
		 WHERE sc.score_id = ?
		 ORDER BY sc.created_at`, intParam(c.Param("scoreId")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.List(c, rows)
}

// InviteCollaborator POST /api/collaborators
func (h *Handler) InviteCollaborator(c *gin.Context) {
	var body struct {
		ScoreID   *int    `json:"score_id"`
		UserID    *int    `json:"user_id"`
		Role      *string `json:"role"`
		InvitedBy *int    `json:"invited_by"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "请求参数有误")
		return
	}
	if body.ScoreID == nil || body.UserID == nil || body.Role == nil {
		httpx.Fail(c, http.StatusBadRequest, "请求参数有误")
		return
	}
	if *body.Role != "reviewer" && *body.Role != "contributor" {
		httpx.Fail(c, http.StatusBadRequest, "角色无效")
		return
	}

	ctx := c.Request.Context()

	// 检查是否已是协作者
	var existing []int
	if err := h.App.DB.SelectContext(ctx, &existing,
		"SELECT id FROM score_collaborators WHERE score_id = ? AND user_id = ?",
		*body.ScoreID, *body.UserID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	if len(existing) > 0 {
		httpx.Fail(c, http.StatusBadRequest, "该用户已是协作者")
		return
	}

	res, err := h.App.DB.ExecContext(ctx,
		"INSERT INTO score_collaborators (score_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)",
		*body.ScoreID, *body.UserID, *body.Role, body.InvitedBy)
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	id, _ := res.LastInsertId()
	c.PureJSON(http.StatusCreated, createdResponse{ID: id, Message: "邀请成功"})
}

// UpdateCollaboratorRole PUT /api/collaborators/:id/role
func (h *Handler) UpdateCollaboratorRole(c *gin.Context) {
	var body struct {
		Role *string `json:"role"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if _, err := h.App.DB.ExecContext(c.Request.Context(),
		"UPDATE score_collaborators SET role = ? WHERE id = ?", body.Role, intParam(c.Param("id"))); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.OK(c, messageResponse{Message: "角色已更新"})
}

// RemoveCollaborator DELETE /api/collaborators/:id
func (h *Handler) RemoveCollaborator(c *gin.Context) {
	if _, err := h.App.DB.ExecContext(c.Request.Context(),
		"DELETE FROM score_collaborators WHERE id = ?", intParam(c.Param("id"))); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.OK(c, messageResponse{Message: "已移除协作者"})
}
