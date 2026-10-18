package handlers

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"score-review/server-go/internal/httpx"
	"score-review/server-go/internal/middleware"
)

// NotificationRow 通知行（含 JOIN 出的 actor_name / score_name）。
type NotificationRow struct {
	ID        int          `json:"id" db:"id"`
	UserID    int          `json:"user_id" db:"user_id"`
	Type      string       `json:"type" db:"type"`
	ScoreID   *int         `json:"score_id" db:"score_id"`
	ActorID   *int         `json:"actor_id" db:"actor_id"`
	Message   string       `json:"message" db:"message"`
	IsRead    int          `json:"is_read" db:"is_read"`
	CreatedAt httpx.JSTime `json:"created_at" db:"created_at"`
	ActorName *string      `json:"actor_name" db:"actor_name"`
	ScoreName *string      `json:"score_name" db:"score_name"`
}

// UnreadCountResponse 未读数响应（Node 直接返回结果行本身）。
type UnreadCountResponse struct {
	Count int `json:"count"`
}

// ListNotifications GET /api/notifications/:userId
func (h *Handler) ListNotifications(c *gin.Context) {
	rows := make([]NotificationRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		`SELECT n.*, u.name as actor_name, s.name as score_name
		 FROM notifications n
		 LEFT JOIN users u ON n.actor_id = u.id
		 LEFT JOIN scores s ON n.score_id = s.id
		 WHERE n.user_id = ?
		 ORDER BY n.created_at DESC
		 LIMIT 50`, intParam(c.Param("userId")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	httpx.List(c, rows)
}

// GetUnreadCount GET /api/notifications/:userId/unread-count
func (h *Handler) GetUnreadCount(c *gin.Context) {
	var resp UnreadCountResponse
	err := h.App.DB.GetContext(c.Request.Context(), &resp,
		"SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE",
		intParam(c.Param("userId")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	httpx.OK(c, resp)
}

// MarkNotificationRead PUT /api/notifications/:id/read  （JWT 鉴权）
func (h *Handler) MarkNotificationRead(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		httpx.Fail(c, http.StatusUnauthorized, "未登录或 token 缺失")
		return
	}
	if _, err := h.App.DB.ExecContext(c.Request.Context(),
		"UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?",
		intParam(c.Param("id")), user.ID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	httpx.OK(c, messageResponse{Message: "已标记已读"})
}

// MarkAllNotificationsRead PUT /api/notifications/read-all/:userId  （JWT 鉴权）
//
// ⚠ 保留 Node 版既有行为：**忽略路径里的 :userId，只按 token 里的用户 id 更新**。
// 这在语义上是可疑的（路径参数形同虚设），但改动会改变接口契约，故照搬。
func (h *Handler) MarkAllNotificationsRead(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		httpx.Fail(c, http.StatusUnauthorized, "未登录或 token 缺失")
		return
	}
	if _, err := h.App.DB.ExecContext(c.Request.Context(),
		"UPDATE notifications SET is_read = TRUE WHERE user_id = ?", user.ID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	httpx.OK(c, messageResponse{Message: "全部已读"})
}

// NotificationParams createNotification 的入参。
type NotificationParams struct {
	UserID  int
	Type    string
	ScoreID *int
	ActorID *int
	Message string
}

// createNotification 供 reviews / invitations / branches 复用（Node 里是从
// routes/notifications 导出的内部函数）。**通知失败不阻塞主流程**，与 Node 一致。
func (h *Handler) createNotification(ctx context.Context, p NotificationParams) {
	if _, err := h.App.DB.ExecContext(ctx,
		"INSERT INTO notifications (user_id, type, score_id, actor_id, message) VALUES (?, ?, ?, ?, ?)",
		p.UserID, p.Type, p.ScoreID, p.ActorID, p.Message); err != nil {
		slog.Error("创建通知失败", "err", err)
	}
}
