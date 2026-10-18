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

// GetVersion GET /api/versions/:id
func (h *Handler) GetVersion(c *gin.Context) {
	rows := make([]models.SectionVersionRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		"SELECT * FROM section_versions WHERE id = ?", intParam(c.Param("id")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	if len(rows) == 0 {
		httpx.Fail(c, http.StatusNotFound, "未找到该版本")
		return
	}
	httpx.OK(c, rows[0])
}

// restoredPayload 是回滚响应里的 restored 字段。
type restoredPayload struct {
	Name          string  `json:"name"`
	Content       *string `json:"content"`
	Tempo         *string `json:"tempo"`
	KeySignature  *string `json:"key_signature"`
	TimeSignature *string `json:"time_signature"`
}

type rollbackResponse struct {
	Message   string          `json:"message"`
	SectionID int             `json:"section_id"`
	Restored  restoredPayload `json:"restored"`
}

// RollbackVersion POST /api/versions/:id/rollback
//
// 移植自 server/src/routes/versions.ts：先把手头的当前内容另存为一个版本
// （这样再次回滚还能回来），再用历史版本覆盖 sections。
// 整个过程在一个事务里，任一步失败全部回滚。
func (h *Handler) RollbackVersion(c *gin.Context) {
	versionID := intParam(c.Param("id"))
	ctx := c.Request.Context()

	var restored restoredPayload
	var sectionID int

	err := database.WithTx(ctx, h.App.DB, func(tx *sqlx.Tx) error {
		// 1) 取目标历史版本
		var version models.SectionVersionRow
		if err := tx.GetContext(ctx, &version,
			"SELECT * FROM section_versions WHERE id = ?", versionID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return database.ErrNotFound // 映射为 404「未找到该版本」
			}
			return err
		}

		// 2) 取当前乐段
		var current models.SectionRow
		if err := tx.GetContext(ctx, &current,
			"SELECT * FROM sections WHERE id = ?", version.SectionID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return errSectionNotFound // 映射为 404「未找到对应的乐段」
			}
			return err
		}

		// 3) 把当前内容另存为版本，便于再次回溯
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO section_versions (section_id, name, content, tempo, key_signature, time_signature)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			current.ID, current.Name, current.Content, current.Tempo,
			current.KeySignature, current.TimeSignature); err != nil {
			return err
		}

		// 4) 用历史版本覆盖
		if _, err := tx.ExecContext(ctx,
			"UPDATE sections SET name=?, content=?, tempo=?, key_signature=?, time_signature=? WHERE id=?",
			version.Name, version.Content, version.Tempo,
			version.KeySignature, version.TimeSignature, version.SectionID); err != nil {
			return err
		}

		sectionID = version.SectionID
		restored = restoredPayload{
			Name: version.Name, Content: version.Content, Tempo: version.Tempo,
			KeySignature: version.KeySignature, TimeSignature: version.TimeSignature,
		}
		return nil
	})

	switch {
	case errors.Is(err, database.ErrNotFound):
		httpx.Fail(c, http.StatusNotFound, "未找到该版本")
		return
	case errors.Is(err, errSectionNotFound):
		httpx.Fail(c, http.StatusNotFound, "未找到对应的乐段")
		return
	case err != nil:
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	httpx.OK(c, rollbackResponse{
		Message:   "已回溯到历史版本",
		SectionID: sectionID,
		Restored:  restored,
	})
}

// errSectionNotFound 用于区分「版本不存在」与「乐段不存在」两种 404 文案。
var errSectionNotFound = errors.New("乐段不存在")
