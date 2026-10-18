package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"score-review/server-go/internal/database"
	"score-review/server-go/internal/httpx"
)

// TagRow 对应 tags 表。
type TagRow struct {
	ID    int    `json:"id" db:"id"`
	Name  string `json:"name" db:"name"`
	Color string `json:"color" db:"color"`
}

// ListTags GET /api/tags
func (h *Handler) ListTags(c *gin.Context) {
	rows := make([]TagRow, 0)
	if err := h.App.DB.SelectContext(c.Request.Context(), &rows, "SELECT * FROM tags ORDER BY name"); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.List(c, rows)
}

// GetScoreTags GET /api/tags/score/:scoreId
func (h *Handler) GetScoreTags(c *gin.Context) {
	rows := make([]TagRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		`SELECT t.* FROM tags t
		 JOIN score_tags st ON t.id = st.tag_id
		 WHERE st.score_id = ?
		 ORDER BY t.name`, intParam(c.Param("scoreId")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.List(c, rows)
}

// SetScoreTags PUT /api/tags/score/:scoreId —— 替换该乐谱的全部标签
//
// 缺陷修复：Node 版「先删后批量插」是两次独立写且无事务，
// 中途失败会导致标签全丢。这里用事务包住。
//
// 另：Node 用 mysql2 的 `INSERT ... VALUES ?` 批量语法传二维数组，
// 标准 SQL 没有这种写法，Go 侧改为拼 `(?,?),(?,?)` 占位符。
func (h *Handler) SetScoreTags(c *gin.Context) {
	var body struct {
		TagIDs []int `json:"tag_ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}

	scoreID := intParam(c.Param("scoreId"))
	err := database.WithTx(c.Request.Context(), h.App.DB, func(tx *sqlx.Tx) error {
		if _, err := tx.ExecContext(c.Request.Context(),
			"DELETE FROM score_tags WHERE score_id = ?", scoreID); err != nil {
			return err
		}
		if len(body.TagIDs) == 0 {
			return nil
		}

		placeholders := make([]string, 0, len(body.TagIDs))
		args := make([]any, 0, len(body.TagIDs)*2)
		for _, tagID := range body.TagIDs {
			placeholders = append(placeholders, "(?, ?)")
			args = append(args, scoreID, tagID)
		}
		_, err := tx.ExecContext(c.Request.Context(),
			"INSERT INTO score_tags (score_id, tag_id) VALUES "+strings.Join(placeholders, ", "), args...)
		return err
	})

	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.OK(c, messageResponse{Message: "标签已更新"})
}
