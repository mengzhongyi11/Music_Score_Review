package handlers

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"score-review/server-go/internal/database"
	"score-review/server-go/internal/httpx"
	"score-review/server-go/internal/models"
)

// BranchRow 分支行（含 JOIN 与子查询扩展列）。
type BranchRow struct {
	ID              int          `json:"id" db:"id"`
	ScoreID         int          `json:"score_id" db:"score_id"`
	Name            string       `json:"name" db:"name"`
	Status          string       `json:"status" db:"status"`
	CreatedBy       *int         `json:"created_by" db:"created_by"`
	CreatedAt       httpx.JSTime `json:"created_at" db:"created_at"`
	CreatedByName   *string      `json:"created_by_name,omitempty" db:"created_by_name"`
	CreatedByAvatar *string      `json:"created_by_avatar,omitempty" db:"created_by_avatar"`
	ChangesCount    *int         `json:"changes_count,omitempty" db:"changes_count"`
}

// BranchOverrideRow 分支改动行（diff 时带出主库当前值）。
type BranchOverrideRow struct {
	ID            int          `json:"id" db:"id"`
	BranchID      int          `json:"branch_id" db:"branch_id"`
	SectionID     int          `json:"section_id" db:"section_id"`
	Name          *string      `json:"name" db:"name"`
	Content       *string      `json:"content" db:"content"`
	Tempo         *string      `json:"tempo" db:"tempo"`
	KeySignature  *string      `json:"key_signature" db:"key_signature"`
	TimeSignature *string      `json:"time_signature" db:"time_signature"`
	CreatedAt     httpx.JSTime `json:"created_at" db:"created_at"`
	// 这五个字段只在 diff 查询里出现，且**必须保留 null**（不能用 omitempty）：
	// Node 在 s.tempo 为 NULL 时返回 "main_tempo": null，omitempty 会把键整个删掉。
	MainName    *string `json:"main_name" db:"main_name"`
	MainContent *string `json:"main_content" db:"main_content"`
	MainTempo   *string `json:"main_tempo" db:"main_tempo"`
	MainKey     *string `json:"main_key" db:"main_key"`
	MainTime    *string `json:"main_time" db:"main_time"`
}

// GetBranches GET /api/branches/score/:scoreId
func (h *Handler) GetBranches(c *gin.Context) {
	rows := make([]BranchRow, 0)
	err := h.App.DB.SelectContext(c.Request.Context(), &rows,
		`SELECT b.*, u.name as created_by_name, u.avatar as created_by_avatar,
		   (SELECT COUNT(*) FROM branch_overrides bo WHERE bo.branch_id = b.id) as changes_count
		 FROM branches b
		 LEFT JOIN users u ON b.created_by = u.id
		 WHERE b.score_id = ?
		 ORDER BY b.created_at DESC`, intParam(c.Param("scoreId")))
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.List(c, rows)
}

// createBranchResponse 创建分支的响应（比通用 createdResponse 多一个 name）。
type createBranchResponse struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	Message string `json:"message"`
}

// CreateBranch POST /api/branches
func (h *Handler) CreateBranch(c *gin.Context) {
	var body struct {
		ScoreID   *int    `json:"score_id"`
		Name      *string `json:"name"`
		CreatedBy *int    `json:"created_by"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "请求参数有误")
		return
	}
	if body.ScoreID == nil || body.Name == nil || body.CreatedBy == nil {
		httpx.Fail(c, http.StatusBadRequest, "请求参数有误")
		return
	}

	res, err := h.App.DB.ExecContext(c.Request.Context(),
		"INSERT INTO branches (score_id, name, created_by) VALUES (?, ?, ?)",
		*body.ScoreID, *body.Name, *body.CreatedBy)
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	id, _ := res.LastInsertId()

	c.PureJSON(http.StatusCreated, createBranchResponse{ID: id, Name: *body.Name, Message: "分支创建成功"})
}

// UpdateBranchSection PUT /api/branches/:branchId/sections/:sectionId
// —— 分支改动 upsert（有则更新，无则插入）
func (h *Handler) UpdateBranchSection(c *gin.Context) {
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

	ctx := c.Request.Context()
	branchID := intParam(c.Param("branchId"))
	sectionID := intParam(c.Param("sectionId"))

	var existing []int
	if err := h.App.DB.SelectContext(ctx, &existing,
		"SELECT id FROM branch_overrides WHERE branch_id = ? AND section_id = ?",
		branchID, sectionID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	if len(existing) > 0 {
		_, err := h.App.DB.ExecContext(ctx,
			"UPDATE branch_overrides SET name=?, content=?, tempo=?, key_signature=?, time_signature=? WHERE branch_id=? AND section_id=?",
			body.Name, body.Content, body.Tempo, body.KeySignature, body.TimeSignature, branchID, sectionID)
		if err != nil {
			httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
			return
		}
	} else {
		_, err := h.App.DB.ExecContext(ctx,
			"INSERT INTO branch_overrides (branch_id, section_id, name, content, tempo, key_signature, time_signature) VALUES (?, ?, ?, ?, ?, ?, ?)",
			branchID, sectionID, body.Name, body.Content, body.Tempo, body.KeySignature, body.TimeSignature)
		if err != nil {
			httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
			return
		}
	}

	httpx.OK(c, messageResponse{Message: "分支修改已保存"})
}

type branchDiffResponse struct {
	Branch BranchRow            `json:"branch"`
	Diffs  []BranchOverrideRow  `json:"diffs"`
}

// GetBranchDiff GET /api/branches/:branchId/diff
func (h *Handler) GetBranchDiff(c *gin.Context) {
	ctx := c.Request.Context()
	branchID := intParam(c.Param("branchId"))

	branches := make([]BranchRow, 0)
	if err := h.App.DB.SelectContext(ctx, &branches,
		"SELECT * FROM branches WHERE id = ?", branchID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	if len(branches) == 0 {
		httpx.Fail(c, http.StatusNotFound, "分支不存在")
		return
	}

	diffs := make([]BranchOverrideRow, 0)
	if err := h.App.DB.SelectContext(ctx, &diffs,
		`SELECT bo.*, s.name as main_name, s.content as main_content,
		        s.tempo as main_tempo, s.key_signature as main_key, s.time_signature as main_time
		 FROM branch_overrides bo
		 JOIN sections s ON bo.section_id = s.id
		 WHERE bo.branch_id = ?`, branchID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	httpx.OK(c, branchDiffResponse{Branch: branches[0], Diffs: diffs})
}

type mergeResponse struct {
	Message     string `json:"message"`
	MergedCount int    `json:"mergedCount"`
}

// MergeBranch POST /api/branches/:branchId/merge
//
// 事务覆盖「逐条 override 覆盖主库（先存版本）+ 标记分支已合并」；
// 通知在提交之后、事务之外发送，失败不阻塞（与 Node 完全一致）。
func (h *Handler) MergeBranch(c *gin.Context) {
	ctx := c.Request.Context()
	branchID := intParam(c.Param("branchId"))

	var body struct {
		ActorID *int `json:"actor_id"`
	}
	_ = c.ShouldBindJSON(&body)
	actorID := 1
	if body.ActorID != nil {
		actorID = *body.ActorID
	}

	var branchName string
	mergedCount := 0

	err := database.WithTx(ctx, h.App.DB, func(tx *sqlx.Tx) error {
		overrides := make([]BranchOverrideRow, 0)
		if err := tx.SelectContext(ctx, &overrides,
			"SELECT * FROM branch_overrides WHERE branch_id = ?", branchID); err != nil {
			return err
		}

		if err := tx.GetContext(ctx, &branchName,
			"SELECT name FROM branches WHERE id = ?", branchID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				branchName = "未知分支"
			} else {
				return err
			}
		}

		for _, ov := range overrides {
			// 先查主库当前内容并另存为版本
			var cur models.SectionRow
			err := tx.GetContext(ctx, &cur, "SELECT * FROM sections WHERE id = ?", ov.SectionID)
			if err == nil {
				if _, err := tx.ExecContext(ctx,
					`INSERT INTO section_versions (section_id, name, content, tempo, key_signature, time_signature)
					 VALUES (?, ?, ?, ?, ?, ?)`,
					ov.SectionID, cur.Name, cur.Content, cur.Tempo, cur.KeySignature, cur.TimeSignature); err != nil {
					return err
				}
			} else if !errors.Is(err, sql.ErrNoRows) {
				return err
			}

			// 再用分支内容覆盖主库
			if _, err := tx.ExecContext(ctx,
				"UPDATE sections SET name=?, content=?, tempo=?, key_signature=?, time_signature=? WHERE id=?",
				ov.Name, ov.Content, ov.Tempo, ov.KeySignature, ov.TimeSignature, ov.SectionID); err != nil {
				return err
			}
		}

		if _, err := tx.ExecContext(ctx,
			"UPDATE branches SET status = ? WHERE id = ?", "merged", branchID); err != nil {
			return err
		}

		mergedCount = len(overrides)
		return nil
	})
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	// 合并通知：乐谱主人 + 全部协作者（失败不阻塞）
	var scoreInfo struct {
		ID      int    `db:"id"`
		Name    string `db:"name"`
		OwnerID *int   `db:"owner_id"`
	}
	if err := h.App.DB.GetContext(ctx, &scoreInfo,
		"SELECT id, name, owner_id FROM scores WHERE id = (SELECT score_id FROM branches WHERE id = ?)",
		branchID); err == nil {
		msg := "已将「" + scoreInfo.Name + "」的分支「" + branchName + "」合并到主库"

		if scoreInfo.OwnerID != nil && *scoreInfo.OwnerID != actorID {
			h.createNotification(ctx, NotificationParams{
				UserID: *scoreInfo.OwnerID, Type: "merge",
				ScoreID: &scoreInfo.ID, ActorID: &actorID, Message: msg,
			})
		}

		collaborators := make([]int, 0)
		if err := h.App.DB.SelectContext(ctx, &collaborators,
			"SELECT user_id FROM score_collaborators WHERE score_id = ? AND user_id != ?",
			scoreInfo.ID, actorID); err == nil {
			for _, uid := range collaborators {
				h.createNotification(ctx, NotificationParams{
					UserID: uid, Type: "merge",
					ScoreID: &scoreInfo.ID, ActorID: &actorID, Message: msg,
				})
			}
		}
	}

	httpx.OK(c, mergeResponse{
		Message:     "合并成功，共合并 " + strconv.Itoa(mergedCount) + " 处修改",
		MergedCount: mergedCount,
	})
}

// UpdateBranchStatus PUT /api/branches/:branchId/status
func (h *Handler) UpdateBranchStatus(c *gin.Context) {
	var body struct {
		Status *string `json:"status"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if _, err := h.App.DB.ExecContext(c.Request.Context(),
		"UPDATE branches SET status = ? WHERE id = ?", body.Status, intParam(c.Param("branchId"))); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}
	httpx.OK(c, messageResponse{Message: "分支状态已更新"})
}
