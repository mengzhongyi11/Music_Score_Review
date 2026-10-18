package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"score-review/server-go/internal/httpx"
	"score-review/server-go/internal/models"
)

// UserFullRow 对应 users 表的全部列（含 password）。
//
// ⚠ 安全提示：Node 版用 `SELECT *` 会把 password 一并返回给前端，
// 属既有缺陷。此处**保持行为一致**以便契约可验证，建议后续单独修
// （改成显式列出字段）。同样的问题见 GetUser / GetUserProfile。
type UserFullRow struct {
	ID            int          `json:"id" db:"id"`
	Name          string       `json:"name" db:"name"`
	Password      *string      `json:"password" db:"password"`
	Nickname      *string      `json:"nickname" db:"nickname"`
	Phone         *string      `json:"phone" db:"phone"`
	PhoneVerified *int         `json:"phone_verified" db:"phone_verified"`
	Avatar        *string      `json:"avatar" db:"avatar"`
	Role          *string      `json:"role" db:"role"`
	Title         *string      `json:"title" db:"title"`
	Bio           *string      `json:"bio" db:"bio"`
	CreatedAt     httpx.JSTime `json:"created_at" db:"created_at"`
}

// ActivityRow 用户动态行。
type ActivityRow struct {
	Type      string      `json:"type" db:"type"`
	Time      httpx.JSTime `json:"time" db:"time"`
	Summary   string      `json:"summary" db:"summary"`
	ScoreName string      `json:"score_name" db:"score_name"`
	ScoreID   int         `json:"score_id" db:"score_id"`
}

// ListUsers GET /api/users
func (h *Handler) ListUsers(c *gin.Context) {
	rows := make([]UserFullRow, 0)
	if err := h.App.DB.SelectContext(c.Request.Context(), &rows, "SELECT * FROM users ORDER BY id"); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.List(c, rows)
}

// GetUser GET /api/users/:id
func (h *Handler) GetUser(c *gin.Context) {
	rows := make([]UserFullRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		"SELECT * FROM users WHERE id = ?", intParam(c.Param("id")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	if len(rows) == 0 {
		httpx.Fail(c, http.StatusNotFound, "未找到该用户")
		return
	}
	httpx.OK(c, rows[0])
}

// GetUserProfile GET /api/users/:id/profile —— 用户信息 + 三项统计
func (h *Handler) GetUserProfile(c *gin.Context) {
	ctx := c.Request.Context()
	userID := intParam(c.Param("id"))

	rows := make([]UserFullRow, 0)
	if err := h.App.DB.SelectContext(ctx, &rows, "SELECT * FROM users WHERE id = ?", userID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	if len(rows) == 0 {
		httpx.Fail(c, http.StatusNotFound, "未找到该用户")
		return
	}

	var myScores, collaborations, comments int
	if err := h.App.DB.GetContext(ctx, &myScores,
		"SELECT COUNT(*) as count FROM scores WHERE owner_id = ?", userID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	if err := h.App.DB.GetContext(ctx, &collaborations,
		"SELECT COUNT(DISTINCT score_id) as count FROM score_collaborators WHERE user_id = ?", userID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	if err := h.App.DB.GetContext(ctx, &comments,
		"SELECT COUNT(*) as count FROM comments WHERE user_id = ?", userID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	// Node 是 `{...user, stats:{...}}` 展开，此处用匿名结构保证键顺序为「用户字段后接 stats」
	httpx.OK(c, struct {
		UserFullRow
		Stats profileStats `json:"stats"`
	}{
		UserFullRow: rows[0],
		Stats: profileStats{
			MyScores: myScores, Collaborations: collaborations, Comments: comments,
		},
	})
}

type profileStats struct {
	MyScores       int `json:"myScores"`
	Collaborations int `json:"collaborations"`
	Comments       int `json:"comments"`
}

// GetUserScores GET /api/users/:id/scores
func (h *Handler) GetUserScores(c *gin.Context) {
	rows := make([]models.ScoreRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		`SELECT s.*, u.name as owner_name, u.avatar as owner_avatar
		 FROM scores s LEFT JOIN users u ON s.owner_id = u.id
		 WHERE s.owner_id = ? ORDER BY s.updated_at DESC`, intParam(c.Param("id")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.List(c, rows)
}

// CollabScoreRow 协作乐谱行（多了 collab_role）。
type CollabScoreRow struct {
	models.ScoreRow
	CollabRole string `json:"collab_role" db:"collab_role"`
}

// GetUserCollaborations GET /api/users/:id/collaborations
func (h *Handler) GetUserCollaborations(c *gin.Context) {
	rows := make([]CollabScoreRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		`SELECT s.*, u.name as owner_name, u.avatar as owner_avatar, sc.role as collab_role
		 FROM score_collaborators sc
		 JOIN scores s ON sc.score_id = s.id
		 LEFT JOIN users u ON s.owner_id = u.id
		 WHERE sc.user_id = ?
		 ORDER BY s.updated_at DESC`, intParam(c.Param("id")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.List(c, rows)
}

// GetUserActivity GET /api/users/:id/activity?limit=
//
// 复刻 Node 的 `Math.min(Number(limit) || 20, 50)`：
// limit 缺省或非数字都退化为 20，上限 50。
func (h *Handler) GetUserActivity(c *gin.Context) {
	limit := 20
	if raw := c.Query("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n != 0 {
			limit = n
		}
	}
	if limit > 50 {
		limit = 50
	}

	userID := intParam(c.Param("id"))
	rows := make([]ActivityRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		`SELECT * FROM (
		   (SELECT 'comment' as type, c.created_at as time, c.content as summary,
		           sc.name as score_name, sc.id as score_id
		    FROM comments c
		    JOIN sections s ON c.section_id = s.id
		    JOIN scores sc ON s.score_id = sc.id
		    WHERE c.user_id = ?)
		   UNION ALL
		   (SELECT 'create_score' as type, s.created_at as time,
		           CONCAT('创建了乐谱「', s.name, '」') as summary,
		           s.name as score_name, s.id as score_id
		    FROM scores s WHERE s.owner_id = ?)
		 ) AS activity
		 ORDER BY time DESC LIMIT ?`, userID, userID, limit)
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.List(c, rows)
}
