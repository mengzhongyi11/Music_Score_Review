package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"score-review/server-go/internal/httpx"
	"score-review/server-go/internal/services"
)

// MergeConflictRow 已落库的冲突记录（mc.* + JOIN 出的 section_name）。
type MergeConflictRow struct {
	ID             int          `json:"id" db:"id"`
	BranchID       int          `json:"branch_id" db:"branch_id"`
	ScoreID        int          `json:"score_id" db:"score_id"`
	SectionID      int          `json:"section_id" db:"section_id"`
	ConflictType   string       `json:"conflict_type" db:"conflict_type"`
	MainContent    *string      `json:"main_content" db:"main_content"`
	BranchContent  *string      `json:"branch_content" db:"branch_content"`
	ConflictDetail *string      `json:"conflict_detail" db:"conflict_detail"`
	MergeSuggestion *string     `json:"merge_suggestion" db:"merge_suggestion"`
	Status         string       `json:"status" db:"status"`
	ResolvedBy     *int         `json:"resolved_by" db:"resolved_by"`
	ResolvedAt     httpx.NullJSTime `json:"resolved_at" db:"resolved_at"`
	CreatedAt      httpx.JSTime `json:"created_at" db:"created_at"`
	SectionName    *string      `json:"section_name" db:"section_name"`
}

// newConflict 是新检测出的冲突（注意字段是 camelCase，且不含 main/branch 原文）。
type newConflict struct {
	ID              int64   `json:"id"`
	BranchID        int     `json:"branch_id"`
	ScoreID         int     `json:"score_id"`
	SectionID       int     `json:"section_id"`
	SectionName     *string `json:"section_name"`
	ConflictType    string  `json:"conflict_type"`
	ConflictDetail  string  `json:"conflict_detail"`
	MainValue       string  `json:"mainValue"`
	BranchValue     string  `json:"branchValue"`
	MeasureIndex    *int    `json:"measureIndex,omitempty"`
	NoteIndex       *int    `json:"noteIndex,omitempty"`
	MergeSuggestion *string `json:"merge_suggestion"`
	Status          string  `json:"status"`
}

type conflictSummary struct {
	Total   int `json:"total"`
	Pending int `json:"pending"`
}

type conflictsResponse struct {
	Conflicts any             `json:"conflicts"`
	Summary   conflictSummary `json:"summary"`
}

// overrideWithMain 用于重新检测冲突：分支改动 + 主库当前值。
type overrideWithMain struct {
	SectionID   int     `db:"section_id"`
	ScoreID     int     `db:"score_id"`
	SectionName *string `db:"section_name"`
	Content     *string `db:"content"`
	Tempo       *string `db:"tempo"`
	KeySignature *string `db:"key_signature"`
	TimeSignature *string `db:"time_signature"`
	MainName    *string `db:"main_name"`
	MainContent *string `db:"main_content"`
	MainTempo   *string `db:"main_tempo"`
	MainKey     *string `db:"main_key"`
	MainTime    *string `db:"main_time"`
}

// GetConflicts GET /api/merge/conflicts/:branchId
//
// ⚠ 与 Node 一致：这是一个**有副作用且非幂等**的 GET——当没有 pending 冲突时
// 会重新检测、调用 LLM、并写库。迁移时保持原语义不动。
func (h *Handler) GetConflicts(c *gin.Context) {
	ctx := c.Request.Context()
	branchID := intParam(c.Param("branchId"))

	// ① 先查已有冲突
	existing := make([]MergeConflictRow, 0)
	if err := h.App.DB.SelectContext(ctx, &existing,
		`SELECT mc.*, s.name as section_name
		 FROM merge_conflicts mc
		 LEFT JOIN sections s ON mc.section_id = s.id
		 WHERE mc.branch_id = ?
		 ORDER BY FIELD(mc.status, 'pending', 'resolved', 'accepted', 'overridden'), mc.id`,
		branchID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	// ② 有 pending 就直接返回，不重复检测
	pendingCount := 0
	for _, c0 := range existing {
		if c0.Status == "pending" {
			pendingCount++
		}
	}
	if pendingCount > 0 {
		httpx.OK(c, conflictsResponse{
			Conflicts: existing,
			Summary:   conflictSummary{Total: len(existing), Pending: pendingCount},
		})
		return
	}

	// ③ 无 pending → 重新检测
	items := make([]overrideWithMain, 0)
	if err := h.App.DB.SelectContext(ctx, &items,
		`SELECT bo.section_id, bo.content, bo.tempo, bo.key_signature, bo.time_signature,
		        s.name as section_name, s.score_id,
		        s.name as main_name, s.content as main_content,
		        s.tempo as main_tempo, s.key_signature as main_key, s.time_signature as main_time
		 FROM branch_overrides bo
		 JOIN sections s ON bo.section_id = s.id
		 WHERE bo.branch_id = ?`, branchID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	if len(items) == 0 {
		httpx.OK(c, conflictsResponse{
			Conflicts: []newConflict{},
			Summary:   conflictSummary{Total: 0, Pending: 0},
		})
		return
	}

	// 清除旧的已解决记录
	if _, err := h.App.DB.ExecContext(ctx,
		`DELETE FROM merge_conflicts WHERE branch_id = ? AND status = "pending"`, branchID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	detected := make([]newConflict, 0)
	for _, item := range items {
		result := services.DetectConflicts(services.DiffInput{
			MainContent:   item.MainContent,
			BranchContent: item.Content,
			MainTempo:     item.MainTempo,
			BranchTempo:   item.Tempo,
			MainKey:       item.MainKey,
			BranchKey:     item.KeySignature,
			MainTime:      item.MainTime,
			BranchTime:    item.TimeSignature,
		})
		if !result.HasConflict {
			continue
		}

		for _, cf := range result.Conflicts {
			// 第二段：检索规范依据（内部按冲突类型决定是否检索）
			suggestion := h.App.DashScope.GenerateMergeSuggestion(ctx, h.App.KB, services.MergeParams{
				ConflictDetail: cf.Description,
				MainValue:      cf.MainValue,
				BranchValue:    cf.BranchValue,
				ConflictType:   cf.Type,
			})

			var suggestionText *string
			if suggestion != nil {
				suggestionText = &suggestion.SuggestionText
			}

			res, err := h.App.DB.ExecContext(ctx,
				`INSERT INTO merge_conflicts (branch_id, score_id, section_id, conflict_type, main_content, branch_content, conflict_detail, merge_suggestion, status)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
				branchID, item.ScoreID, item.SectionID, cf.Type,
				cf.MainValue, cf.BranchValue, cf.Description, suggestionText)
			if err != nil {
				httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
				return
			}
			id, _ := res.LastInsertId()

			detected = append(detected, newConflict{
				ID: id, BranchID: branchID, ScoreID: item.ScoreID,
				SectionID: item.SectionID, SectionName: item.SectionName,
				ConflictType: cf.Type, ConflictDetail: cf.Description,
				MainValue: cf.MainValue, BranchValue: cf.BranchValue,
				MeasureIndex: cf.MeasureIndex, NoteIndex: cf.NoteIndex,
				MergeSuggestion: suggestionText, Status: "pending",
			})
		}
	}

	httpx.OK(c, conflictsResponse{
		Conflicts: detected,
		Summary:   conflictSummary{Total: len(detected), Pending: len(detected)},
	})
}

// ResolveConflict POST /api/merge/conflicts/:id/resolve
func (h *Handler) ResolveConflict(c *gin.Context) {
	var body struct {
		Resolution *string `json:"resolution"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "参数校验失败")
		return
	}
	if body.Resolution == nil {
		c.PureJSON(http.StatusBadRequest, gin.H{
			"message": "参数校验失败",
			"errors":  []fieldError{{Field: "resolution", Message: "resolution 必填"}},
		})
		return
	}

	statusMap := map[string]string{
		"accept_main":   "resolved",
		"accept_branch": "accepted",
		"custom":        "overridden",
	}
	status, ok := statusMap[*body.Resolution]
	if !ok {
		c.PureJSON(http.StatusBadRequest, gin.H{
			"message": "参数校验失败",
			"errors":  []fieldError{{Field: "resolution", Message: "resolution 取值无效"}},
		})
		return
	}

	if _, err := h.App.DB.ExecContext(c.Request.Context(),
		"UPDATE merge_conflicts SET status = ?, resolved_at = NOW() WHERE id = ?",
		status, intParam(c.Param("id"))); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	httpx.OK(c, messageResponse{Message: "冲突已解决"})
}
