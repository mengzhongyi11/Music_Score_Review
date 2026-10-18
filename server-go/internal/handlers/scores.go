package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"score-review/server-go/internal/httpx"
	"score-review/server-go/internal/middleware"
	"score-review/server-go/internal/models"
	"score-review/server-go/internal/services"
)

const scoresListKeyPrefix = "scores:list:"

// ListScores GET /api/scores
//
// 支持 owner_id / tag 筛选；带 page+pageSize 时返回分页对象，否则返回裸数组
// （向后兼容，前端两种都接）。
func (h *Handler) ListScores(c *gin.Context) {
	ctx := c.Request.Context()
	ownerID := c.Query("owner_id")
	tag := c.Query("tag")
	page := parsePositiveIntParam(c.Query("page"))
	pageSize := parsePageSizeParam(c.Query("pageSize"))

	cacheKey := fmt.Sprintf("%s%s:%s:%s:%s",
		scoresListKeyPrefix, orAll(ownerID), orAll(tag), orAllPtr(page), orAllPtr(pageSize))

	raw, err := services.WithRawCache(ctx, h.App.Cache, cacheKey, 30*time.Second, func() ([]byte, error) {
		query := `SELECT DISTINCT s.*, u.name as owner_name, u.avatar as owner_avatar,
		            (SELECT COUNT(*) FROM comments c JOIN sections sec ON c.section_id = sec.id WHERE sec.score_id = s.id) as comment_count
		          FROM scores s
		          LEFT JOIN users u ON s.owner_id = u.id`
		params := make([]any, 0, 4)
		conditions := make([]string, 0, 2)

		if tag != "" {
			query += " JOIN score_tags st ON s.id = st.score_id JOIN tags t ON st.tag_id = t.id"
			conditions = append(conditions, "t.name = ?")
			params = append(params, tag)
		}
		if ownerID != "" {
			conditions = append(conditions, "s.owner_id = ?")
			n, _ := strconv.Atoi(ownerID)
			params = append(params, n)
		}
		if len(conditions) > 0 {
			query += " WHERE " + strings.Join(conditions, " AND ")
		}
		query += " ORDER BY s.updated_at DESC"

		// 分页模式：先查总数，再 LIMIT
		if page != nil && pageSize != nil {
			totalQuery := "SELECT COUNT(DISTINCT s.id) as total FROM scores s"
			if tag != "" {
				totalQuery += " JOIN score_tags st ON s.id = st.score_id JOIN tags t ON st.tag_id = t.id"
			}
			if len(conditions) > 0 {
				totalQuery += " WHERE " + strings.Join(conditions, " AND ")
			}

			var total int
			if err := h.App.DB.GetContext(ctx, &total, totalQuery, params...); err != nil {
				return nil, err
			}

			query += " LIMIT ? OFFSET ?"
			pageParams := append(append([]any{}, params...), *pageSize, (*page-1)*(*pageSize))

			rows := make([]models.ScoreRow, 0)
			if err := h.App.DB.SelectContext(ctx, &rows, query, pageParams...); err != nil {
				return nil, err
			}

			return json.Marshal(paginated[models.ScoreRow]{
				Data: rows, Total: total, Page: *page, PageSize: *pageSize,
			})
		}

		rows := make([]models.ScoreRow, 0)
		if err := h.App.DB.SelectContext(ctx, &rows, query, params...); err != nil {
			return nil, err
		}
		return json.Marshal(rows)
	})

	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	writeRawJSON(c, raw)
}

// paginated 是分页响应的形状，字段顺序与 Node 版字面量顺序一致。
type paginated[T any] struct {
	Data     []T `json:"data"`
	Total    int `json:"total"`
	Page     int `json:"page"`
	PageSize int `json:"pageSize"`
}

// GetScore GET /api/scores/:id
func (h *Handler) GetScore(c *gin.Context) {
	rows := make([]models.ScoreRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		`SELECT s.*, u.name as owner_name, u.avatar as owner_avatar
		 FROM scores s
		 LEFT JOIN users u ON s.owner_id = u.id
		 WHERE s.id = ?`, intParam(c.Param("id")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	if len(rows) == 0 {
		httpx.Fail(c, http.StatusNotFound, "未找到该乐谱")
		return
	}
	httpx.OK(c, rows[0])
}

// SearchScores GET /api/scores/search/:keyword
func (h *Handler) SearchScores(c *gin.Context) {
	keyword := "%" + c.Param("keyword") + "%" // 与 Node 版一致，不做通配符转义

	rows := make([]models.ScoreRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		`SELECT s.*, u.name as owner_name, u.avatar as owner_avatar
		 FROM scores s
		 LEFT JOIN users u ON s.owner_id = u.id
		 WHERE s.name LIKE ? OR s.composer LIKE ?
		 ORDER BY s.updated_at DESC`, keyword, keyword)
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.List(c, rows)
}

// CreateScore POST /api/scores
func (h *Handler) CreateScore(c *gin.Context) {
	var body struct {
		Name        string  `json:"name"`
		Composer    string  `json:"composer"`
		Description *string `json:"description"`
		OwnerID     *int    `json:"owner_id"`
		IsPublic    *bool   `json:"is_public"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if body.Name == "" || body.Composer == "" {
		httpx.Fail(c, http.StatusBadRequest, "乐谱名称和作曲者不能为空")
		return
	}

	isPublic := 0
	if body.IsPublic != nil && *body.IsPublic {
		isPublic = 1
	}

	res, err := h.App.DB.ExecContext(c.Request.Context(),
		"INSERT INTO scores (name, composer, description, owner_id, is_public) VALUES (?, ?, ?, ?, ?)",
		body.Name, body.Composer, body.Description, body.OwnerID, isPublic)
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	id, _ := res.LastInsertId()
	services.Del(c.Request.Context(), h.App.Cache, scoresListKeyPrefix+"*") // 失效缓存

	c.PureJSON(http.StatusCreated, createdResponse{ID: id, Message: "乐谱创建成功"})
}

// UpdateReviewStatus PUT /api/scores/:id/review-status —— 显式修改审阅状态
//
// 支持的取值：pending / working / approved / rejected。
//
// 语义约定（与前端 7 天过期规则配合）：
//   - 置为 approved / rejected 时，记录 reviewed_by 与 reviewed_at（NOW()），
//     前端据此在 7 天后把卡片从看板隐藏
//   - 置为 pending / working 时，**清空** reviewed_by / reviewed_at / review_comment，
//     否则刚改回待审的乐谱会因为旧的 reviewed_at 被误判为「已过期」
func (h *Handler) UpdateReviewStatus(c *gin.Context) {
	var body struct {
		Status  *string `json:"status"`
		Comment *string `json:"comment"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Status == nil {
		httpx.Fail(c, http.StatusBadRequest, "状态值无效")
		return
	}

	valid := map[string]bool{"pending": true, "working": true, "approved": true, "rejected": true}
	if !valid[*body.Status] {
		httpx.Fail(c, http.StatusBadRequest, "状态值无效（pending/working/approved/rejected）")
		return
	}

	user, ok := middleware.CurrentUser(c)
	if !ok {
		httpx.Fail(c, http.StatusUnauthorized, "未登录或 token 缺失")
		return
	}

	ctx := c.Request.Context()
	scoreID := intParam(c.Param("id"))

	var err error
	switch *body.Status {
	case "approved", "rejected":
		_, err = h.App.DB.ExecContext(ctx,
			`UPDATE scores SET review_status = ?, reviewed_by = ?, review_comment = ?, reviewed_at = NOW() WHERE id = ?`,
			*body.Status, user.ID, body.Comment, scoreID)
	default:
		_, err = h.App.DB.ExecContext(ctx,
			`UPDATE scores SET review_status = ?, reviewed_by = NULL, review_comment = NULL, reviewed_at = NULL WHERE id = ?`,
			*body.Status, scoreID)
	}
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	services.Del(ctx, h.App.Cache, scoresListKeyPrefix+"*")
	httpx.OK(c, messageResponse{Message: "审阅状态已更新"})
}

// TransferScore PUT /api/scores/:id/transfer
func (h *Handler) TransferScore(c *gin.Context) {
	var body struct {
		NewOwnerID *int `json:"new_owner_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if _, err := h.App.DB.ExecContext(c.Request.Context(),
		"UPDATE scores SET owner_id = ? WHERE id = ?", body.NewOwnerID, intParam(c.Param("id"))); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.OK(c, messageResponse{Message: "所有权已转让"})
}

// DeleteScore DELETE /api/scores/:id
func (h *Handler) DeleteScore(c *gin.Context) {
	if _, err := h.App.DB.ExecContext(c.Request.Context(),
		"DELETE FROM scores WHERE id = ?", intParam(c.Param("id"))); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.OK(c, messageResponse{Message: "乐谱已删除"})
}

/* ── 复用的响应形状 ── */

type messageResponse struct {
	Message string `json:"message"`
}

type createdResponse struct {
	ID      int64  `json:"id"`
	Message string `json:"message"`
}

/* ── 小工具 ── */

// writeRawJSON 直接写已序列化的 JSON 字节（用于缓存命中路径，保证字节一致）。
func writeRawJSON(c *gin.Context, raw []byte) {
	c.Data(http.StatusOK, "application/json; charset=utf-8", raw)
}

// orAll 复刻 Node 的 `x || 'all'`，用于拼缓存键。
func orAll(s string) string {
	if s == "" {
		return "all"
	}
	return s
}

func orAllPtr(p *int) string {
	if p == nil {
		return "all"
	}
	return strconv.Itoa(*p)
}
