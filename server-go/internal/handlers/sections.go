package handlers

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"score-review/server-go/internal/database"
	"score-review/server-go/internal/httpx"
	"score-review/server-go/internal/models"
)

// ListRootSections GET /api/sections/score/:scoreId —— 顶级乐段（parent_id IS NULL）
func (h *Handler) ListRootSections(c *gin.Context) {
	rows := make([]models.SectionRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		"SELECT * FROM sections WHERE score_id = ? AND parent_id IS NULL ORDER BY sort_order",
		intParam(c.Param("scoreId")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.List(c, rows)
}

// ListSectionTree GET /api/sections/score/:scoreId/tree —— 递归 CTE 取完整树
func (h *Handler) ListSectionTree(c *gin.Context) {
	rows := make([]models.SectionRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		`WITH RECURSIVE section_tree AS (
		   SELECT * FROM sections WHERE score_id = ? AND parent_id IS NULL
		   UNION ALL
		   SELECT s.* FROM sections s
		   JOIN section_tree st ON s.parent_id = st.id
		 )
		 SELECT * FROM section_tree ORDER BY sort_order`,
		intParam(c.Param("scoreId")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.List(c, rows)
}

// ListSectionChildren GET /api/sections/:id/children
func (h *Handler) ListSectionChildren(c *gin.Context) {
	rows := make([]models.SectionRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		"SELECT * FROM sections WHERE parent_id = ? ORDER BY sort_order", intParam(c.Param("id")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.List(c, rows)
}

// GetSection GET /api/sections/:id
func (h *Handler) GetSection(c *gin.Context) {
	rows := make([]models.SectionRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		"SELECT * FROM sections WHERE id = ?", intParam(c.Param("id")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	if len(rows) == 0 {
		httpx.Fail(c, http.StatusNotFound, "未找到该乐段")
		return
	}
	httpx.OK(c, rows[0])
}

// ListSectionVersions GET /api/sections/:id/versions
func (h *Handler) ListSectionVersions(c *gin.Context) {
	rows := make([]models.SectionVersionRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		"SELECT * FROM section_versions WHERE section_id = ? ORDER BY created_at DESC LIMIT 50",
		intParam(c.Param("id")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.List(c, rows)
}

// CreateSection POST /api/sections
func (h *Handler) CreateSection(c *gin.Context) {
	var body struct {
		ScoreID   *int    `json:"score_id"`
		ParentID  *int    `json:"parent_id"`
		Name      string  `json:"name"`
		Path      string  `json:"path"`
		Type      *string `json:"type"`
		Content   *string `json:"content"`
		SortOrder *int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}

	sectionType := "section"
	if body.Type != nil && *body.Type != "" {
		sectionType = *body.Type
	}
	sortOrder := 0
	if body.SortOrder != nil {
		sortOrder = *body.SortOrder
	}

	res, err := h.App.DB.ExecContext(c.Request.Context(),
		"INSERT INTO sections (score_id, parent_id, name, path, type, content, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
		body.ScoreID, body.ParentID, body.Name, body.Path, sectionType, body.Content, sortOrder)
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	id, _ := res.LastInsertId()
	c.PureJSON(http.StatusCreated, createdResponse{ID: id, Message: "创建成功"})
}

// UpdateSection PUT /api/sections/:id
//
// 缺陷修复：Node 版「先写历史版本 → 再更新」是两次独立写且无事务，
// 中途失败会留下"有版本记录但内容没更新"的脏数据。这里用事务包住。
func (h *Handler) UpdateSection(c *gin.Context) {
	var body struct {
		Name          *string `json:"name"`
		Content       *string `json:"content"`
		Tempo         *string `json:"tempo"`
		KeySignature  *string `json:"key_signature"`
		TimeSignature *string `json:"time_signature"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}

	sectionID := intParam(c.Param("id"))
	err := database.WithTx(c.Request.Context(), h.App.DB, func(tx *sqlx.Tx) error {
		// 1) 把当前内容存成历史版本
		var cur models.SectionRow
		err := tx.GetContext(c.Request.Context(), &cur, "SELECT * FROM sections WHERE id = ?", sectionID)
		if err == nil {
			if _, err := tx.ExecContext(c.Request.Context(),
				`INSERT INTO section_versions (section_id, name, content, tempo, key_signature, time_signature)
				 VALUES (?, ?, ?, ?, ?, ?)`,
				sectionID, cur.Name, cur.Content, cur.Tempo, cur.KeySignature, cur.TimeSignature); err != nil {
				return err
			}
		} else if !errors.Is(err, sql.ErrNoRows) {
			return err
		}

		// 2) 更新乐段
		_, err = tx.ExecContext(c.Request.Context(),
			"UPDATE sections SET name = ?, content = ?, tempo = ?, key_signature = ?, time_signature = ? WHERE id = ?",
			body.Name, body.Content, body.Tempo, body.KeySignature, body.TimeSignature, sectionID)
		return err
	})

	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.OK(c, messageResponse{Message: "更新成功"})
}

// DeleteSection DELETE /api/sections/:id
func (h *Handler) DeleteSection(c *gin.Context) {
	if _, err := h.App.DB.ExecContext(c.Request.Context(),
		"DELETE FROM sections WHERE id = ?", intParam(c.Param("id"))); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.OK(c, messageResponse{Message: "删除成功"})
}
