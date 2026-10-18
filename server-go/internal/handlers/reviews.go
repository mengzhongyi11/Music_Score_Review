package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"score-review/server-go/internal/database"
	"score-review/server-go/internal/httpx"
)

// ReviewRow 审阅记录行。
type ReviewRow struct {
	ID           int          `json:"id" db:"id"`
	ScoreID      int          `json:"score_id" db:"score_id"`
	ReviewerID   int          `json:"reviewer_id" db:"reviewer_id"`
	Status       string       `json:"status" db:"status"`
	Comment      *string      `json:"comment" db:"comment"`
	CreatedAt    httpx.JSTime `json:"created_at" db:"created_at"`
	ReviewerName *string      `json:"reviewer_name" db:"reviewer_name"`
}

// GetReviewHistory GET /api/reviews/:scoreId
func (h *Handler) GetReviewHistory(c *gin.Context) {
	rows := make([]ReviewRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		`SELECT r.*, u.name as reviewer_name
		 FROM reviews r
		 LEFT JOIN users u ON r.reviewer_id = u.id
		 WHERE r.score_id = ?
		 ORDER BY r.created_at DESC`, intParam(c.Param("scoreId")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	httpx.List(c, rows)
}

type reviewSubmitResponse struct {
	Message  string `json:"message"`
	ReviewID int64  `json:"reviewId"`
}

// SubmitReview POST /api/reviews/:scoreId
//
// 权限校验放在 handler 内（查 users.role），与 Node 版一致——没有走中间件。
// 事务覆盖「更新 scores 审阅字段 + 写 reviews」，通知在提交之后、事务之外发送。
func (h *Handler) SubmitReview(c *gin.Context) {
	var body struct {
		Status     *string `json:"status"`
		Comment    *string `json:"comment"`
		ReviewerID *int    `json:"reviewer_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "参数不完整")
		return
	}
	if body.ReviewerID == nil || body.Status == nil ||
		(*body.Status != "approved" && *body.Status != "rejected") {
		httpx.Fail(c, http.StatusBadRequest, "参数不完整")
		return
	}

	ctx := c.Request.Context()
	scoreID := intParam(c.Param("scoreId"))
	reviewerID := *body.ReviewerID

	// 管理员校验
	var role string
	err := h.App.DB.GetContext(ctx, &role, "SELECT role FROM users WHERE id = ?", reviewerID)
	if err != nil || role != "admin" {
		httpx.Fail(c, http.StatusForbidden, "仅管理员可审阅")
		return
	}

	reviewStatus := "rejected"
	if *body.Status == "approved" {
		reviewStatus = "approved"
	}

	var reviewID int64
	err = database.WithTx(ctx, h.App.DB, func(tx *sqlx.Tx) error {
		if _, err := tx.ExecContext(ctx,
			"UPDATE scores SET review_status = ?, reviewed_by = ?, review_comment = ?, reviewed_at = NOW() WHERE id = ?",
			reviewStatus, reviewerID, body.Comment, scoreID); err != nil {
			return err
		}

		res, err := tx.ExecContext(ctx,
			"INSERT INTO reviews (score_id, reviewer_id, status, comment) VALUES (?, ?, ?, ?)",
			scoreID, reviewerID, *body.Status, body.Comment)
		if err != nil {
			return err
		}
		reviewID, _ = res.LastInsertId()
		return nil
	})
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	// 审阅通知：通知乐谱主人（失败不影响主流程）
	var scoreInfo struct {
		Name    string `db:"name"`
		OwnerID *int   `db:"owner_id"`
	}
	if err := h.App.DB.GetContext(ctx, &scoreInfo,
		"SELECT name, owner_id FROM scores WHERE id = ?", scoreID); err == nil {
		if scoreInfo.OwnerID != nil && *scoreInfo.OwnerID != reviewerID {
			var reviewerName string
			if err := h.App.DB.GetContext(ctx, &reviewerName,
				"SELECT name FROM users WHERE id = ?", reviewerID); err != nil || reviewerName == "" {
				reviewerName = "管理员"
			}
			statusText := "未通过"
			if *body.Status == "approved" {
				statusText = "已通过"
			}
			h.createNotification(ctx, NotificationParams{
				UserID:  *scoreInfo.OwnerID,
				Type:    "review",
				ScoreID: &scoreID,
				ActorID: &reviewerID,
				Message: reviewerName + " 审阅了「" + scoreInfo.Name + "」：" + statusText,
			})
		}
	}

	message := "审阅未通过"
	if *body.Status == "approved" {
		message = "♩ 审阅已通过"
	}
	httpx.OK(c, reviewSubmitResponse{Message: message, ReviewID: reviewID})
}
