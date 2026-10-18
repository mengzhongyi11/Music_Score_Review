package handlers

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"score-review/server-go/internal/database"
	"score-review/server-go/internal/httpx"
)

// InvitationRow 邀请/申请行（含 JOIN 出的名称）。
type InvitationRow struct {
	ID          int          `json:"id" db:"id"`
	ScoreID     int          `json:"score_id" db:"score_id"`
	UserID      int          `json:"user_id" db:"user_id"`
	InvitedBy   *int         `json:"invited_by" db:"invited_by"`
	Type        string       `json:"type" db:"type"`
	Status      string       `json:"status" db:"status"`
	Message     *string      `json:"message" db:"message"`
	CreatedAt   httpx.JSTime `json:"created_at" db:"created_at"`
	UpdatedAt   httpx.JSTime `json:"updated_at" db:"updated_at"`
	ScoreName   *string      `json:"score_name" db:"score_name"`
	InviterName *string      `json:"inviter_name" db:"inviter_name"`
	UserName    *string      `json:"user_name" db:"user_name"`
}

// GetUserInvitations GET /api/invitations/user/:userId —— 待处理的邀请/申请
func (h *Handler) GetUserInvitations(c *gin.Context) {
	rows := make([]InvitationRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		`SELECT i.*, s.name as score_name, u.name as inviter_name
		 FROM invitations i
		 JOIN scores s ON i.score_id = s.id
		 LEFT JOIN users u ON i.invited_by = u.id
		 WHERE i.user_id = ? AND i.status = 'pending'
		 ORDER BY i.created_at DESC`, intParam(c.Param("userId")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	httpx.List(c, rows)
}

// GetScoreApplications GET /api/invitations/score/:scoreId —— 该乐谱的待处理申请
func (h *Handler) GetScoreApplications(c *gin.Context) {
	rows := make([]InvitationRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		`SELECT i.*, u.name as user_name
		 FROM invitations i
		 JOIN users u ON i.user_id = u.id
		 WHERE i.score_id = ? AND i.status = 'pending'
		 ORDER BY i.created_at DESC`, intParam(c.Param("scoreId")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	httpx.List(c, rows)
}

// CreateInvitation POST /api/invitations —— 创建邀请(invite)或申请(apply)
func (h *Handler) CreateInvitation(c *gin.Context) {
	var body struct {
		ScoreID   *int    `json:"score_id"`
		UserID    *int    `json:"user_id"`
		InvitedBy *int    `json:"invited_by"`
		Type      *string `json:"type"`
		Message   *string `json:"message"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "参数不完整")
		return
	}
	if body.ScoreID == nil || body.UserID == nil {
		httpx.Fail(c, http.StatusBadRequest, "参数不完整")
		return
	}

	ctx := c.Request.Context()

	// 已是协作者？
	var exist []int
	if err := h.App.DB.SelectContext(ctx, &exist,
		"SELECT id FROM score_collaborators WHERE score_id = ? AND user_id = ?",
		*body.ScoreID, *body.UserID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	if len(exist) > 0 {
		httpx.Fail(c, http.StatusBadRequest, "该用户已是协作者")
		return
	}

	// 已有待处理？
	var pending []int
	if err := h.App.DB.SelectContext(ctx, &pending,
		`SELECT id FROM invitations WHERE score_id = ? AND user_id = ? AND status = "pending"`,
		*body.ScoreID, *body.UserID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	if len(pending) > 0 {
		httpx.Fail(c, http.StatusBadRequest, "已有待处理的邀请/申请")
		return
	}

	inviteType := "invite"
	if body.Type != nil && *body.Type != "" {
		inviteType = *body.Type
	}

	res, err := h.App.DB.ExecContext(ctx,
		"INSERT INTO invitations (score_id, user_id, invited_by, type, message) VALUES (?, ?, ?, ?, ?)",
		*body.ScoreID, *body.UserID, body.InvitedBy, inviteType, body.Message)
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	// 邀请通知：通知被邀请人（apply 不发、失败不影响主流程）
	if inviteType != "apply" && body.InvitedBy != nil {
		var scoreName, inviterName string
		if err := h.App.DB.GetContext(ctx, &scoreName,
			"SELECT name FROM scores WHERE id = ?", *body.ScoreID); err != nil || scoreName == "" {
			scoreName = "乐谱"
		}
		if err := h.App.DB.GetContext(ctx, &inviterName,
			"SELECT name FROM users WHERE id = ?", *body.InvitedBy); err != nil || inviterName == "" {
			inviterName = "用户"
		}
		h.createNotification(ctx, NotificationParams{
			UserID:  *body.UserID,
			Type:    "invite",
			ScoreID: body.ScoreID,
			ActorID: body.InvitedBy,
			Message: inviterName + " 邀请你协作「" + scoreName + "」",
		})
	}

	id, _ := res.LastInsertId()
	message := "已发送邀请"
	if inviteType == "apply" {
		message = "已提交申请"
	}
	c.PureJSON(http.StatusCreated, createdResponse{ID: id, Message: message})
}

type invitationRespondResponse struct {
	Message string `json:"message"`
}

// RespondInvitation PUT /api/invitations/:id —— 同意/拒绝
//
// 事务覆盖「更新 invitations 状态 + 同意时加入协作者」；两条通知在提交后发送。
func (h *Handler) RespondInvitation(c *gin.Context) {
	var body struct {
		Status *string `json:"status"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "状态值无效")
		return
	}
	if body.Status == nil || (*body.Status != "accepted" && *body.Status != "rejected") {
		httpx.Fail(c, http.StatusBadRequest, "状态值无效")
		return
	}

	ctx := c.Request.Context()
	invitationID := intParam(c.Param("id"))

	var inv InvitationRow
	if err := h.App.DB.GetContext(ctx, &inv,
		"SELECT * FROM invitations WHERE id = ?", invitationID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.Fail(c, http.StatusNotFound, "未找到该记录")
			return
		}
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	err := database.WithTx(ctx, h.App.DB, func(tx *sqlx.Tx) error {
		if _, err := tx.ExecContext(ctx,
			"UPDATE invitations SET status = ? WHERE id = ?", *body.Status, invitationID); err != nil {
			return err
		}
		if *body.Status == "accepted" {
			// 申请方加入为 contributor，被邀请方加入为 reviewer
			role := "reviewer"
			if inv.Type == "apply" {
				role = "contributor"
			}
			if _, err := tx.ExecContext(ctx,
				"INSERT IGNORE INTO score_collaborators (score_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)",
				inv.ScoreID, inv.UserID, role, inv.InvitedBy); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	// 通知（失败不影响主流程）
	var scoreInfo struct {
		Name    string `db:"name"`
		OwnerID *int   `db:"owner_id"`
	}
	scoreErr := h.App.DB.GetContext(ctx, &scoreInfo,
		"SELECT name, owner_id FROM scores WHERE id = ?", inv.ScoreID)

	var userName string
	if err := h.App.DB.GetContext(ctx, &userName,
		"SELECT name FROM users WHERE id = ?", inv.UserID); err != nil || userName == "" {
		userName = "用户"
	}

	if scoreErr == nil {
		switch {
		case *body.Status == "accepted":
			msg := userName + " 已加入「" + scoreInfo.Name + "」协作"
			if scoreInfo.OwnerID != nil && *scoreInfo.OwnerID != inv.UserID {
				h.createNotification(ctx, NotificationParams{
					UserID: *scoreInfo.OwnerID, Type: "member_join",
					ScoreID: &inv.ScoreID, ActorID: &inv.UserID, Message: msg,
				})
			}
			if inv.InvitedBy != nil && *inv.InvitedBy != inv.UserID &&
				(scoreInfo.OwnerID == nil || *inv.InvitedBy != *scoreInfo.OwnerID) {
				h.createNotification(ctx, NotificationParams{
					UserID: *inv.InvitedBy, Type: "member_join",
					ScoreID: &inv.ScoreID, ActorID: &inv.UserID, Message: msg,
				})
			}
		case *body.Status == "rejected" && inv.InvitedBy != nil:
			h.createNotification(ctx, NotificationParams{
				UserID: *inv.InvitedBy, Type: "invite_rejected",
				ScoreID: &inv.ScoreID, ActorID: &inv.UserID,
				Message: userName + " 拒绝了你的协作邀请",
			})
		}
	}

	message := "已拒绝"
	if *body.Status == "accepted" {
		message = "已同意"
	}
	httpx.OK(c, invitationRespondResponse{Message: message})
}
