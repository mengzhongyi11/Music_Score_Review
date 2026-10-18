package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"score-review/server-go/internal/httpx"
	"score-review/server-go/internal/services"
)

type analyzeSectionResponse struct {
	Analysis services.ImpactResult `json:"analysis"`
}

type analyzeBranchResponse struct {
	Analyses []services.ImpactResult `json:"analyses"`
}

type impactSummaryResponse struct {
	Summary impactSummary `json:"summary"`
}

type impactSummary struct {
	High   int `json:"high"`
	Medium int `json:"medium"`
	Low    int `json:"low"`
	Total  int `json:"total"`
}

// AnalyzeSectionImpact POST /api/impact/analyze-section
func (h *Handler) AnalyzeSectionImpact(c *gin.Context) {
	var body struct {
		ScoreID     *int    `json:"score_id"`
		SectionID   any     `json:"section_id"`
		SectionName *string `json:"section_name"`
		NewContent  *string `json:"new_content"`
		OldContent  *string `json:"old_content"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "缺少 new_content")
		return
	}
	if body.NewContent == nil || *body.NewContent == "" {
		httpx.Fail(c, http.StatusBadRequest, "缺少 new_content")
		return
	}

	// Node: String(section_id || '') —— 数字/字符串/缺省都转成字符串
	sectionID := anyToString(body.SectionID)

	sectionName := "未知乐段"
	if body.SectionName != nil && *body.SectionName != "" {
		sectionName = *body.SectionName
	}

	// Node: old_content || ''
	oldContent := ""
	if body.OldContent != nil {
		oldContent = *body.OldContent
	}

	httpx.OK(c, analyzeSectionResponse{
		Analysis: services.AnalyzeSectionImpact(services.ImpactInput{
			SectionID: sectionID, SectionName: sectionName,
			MainContent: &oldContent, BranchContent: body.NewContent,
		}),
	})
}

// impactOverrideItem 影响分析用的分支改动行。
type impactOverrideItem struct {
	SectionID   int     `db:"section_id"`
	SectionName *string `db:"section_name"`
	MainContent *string `db:"main_content"`
	Content     *string `db:"content"`
	ScoreID     int     `db:"score_id"`
}

// AnalyzeBranchImpact POST /api/impact/analyze-branch/:branchId
func (h *Handler) AnalyzeBranchImpact(c *gin.Context) {
	items := make([]impactOverrideItem, 0)
	if err := h.App.DB.SelectContext(c.Request.Context(), &items,
		`SELECT bo.section_id, bo.content, s.name as section_name, s.content as main_content, s.score_id
		 FROM branch_overrides bo
		 JOIN sections s ON bo.section_id = s.id
		 WHERE bo.branch_id = ?`, intParam(c.Param("branchId"))); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	analyses := make([]services.ImpactResult, 0, len(items))
	for _, item := range items {
		mainContent := strOr(item.MainContent, "")
		branchContent := strOr(item.Content, "")
		sectionName := strOr(item.SectionName, "乐段 #"+strconv.Itoa(item.SectionID))

		analyses = append(analyses, services.AnalyzeSectionImpact(services.ImpactInput{
			SectionID: strconv.Itoa(item.SectionID), SectionName: sectionName,
			MainContent: &mainContent, BranchContent: &branchContent,
		}))
	}

	httpx.OK(c, analyzeBranchResponse{Analyses: analyses})
}

// GetImpactSummary GET /api/impact/summary/:scoreId
func (h *Handler) GetImpactSummary(c *gin.Context) {
	// 统计该乐谱**全部**分支改动的影响（不加 branch_id 条件）
	items := make([]impactOverrideItem, 0)
	if err := h.App.DB.SelectContext(c.Request.Context(), &items,
		`SELECT bo.section_id, bo.content, s.name as section_name, s.content as main_content, s.score_id
		 FROM branch_overrides bo
		 JOIN sections s ON bo.section_id = s.id
		 WHERE s.score_id = ?`, intParam(c.Param("scoreId"))); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	summary := impactSummary{}
	for _, item := range items {
		mainContent := strOr(item.MainContent, "")
		branchContent := strOr(item.Content, "")
		result := services.AnalyzeSectionImpact(services.ImpactInput{
			SectionID: strconv.Itoa(item.SectionID), SectionName: strOr(item.SectionName, ""),
			MainContent: &mainContent, BranchContent: &branchContent,
		})
		switch result.OverallRisk {
		case "high":
			summary.High++
		case "medium":
			summary.Medium++
		case "low":
			summary.Low++
		}
	}
	summary.Total = len(items)

	httpx.OK(c, impactSummaryResponse{Summary: summary})
}

// anyToString 复刻 JS 的 String(x || '')：nil/空 → ""，数字 → 十进制字符串。
func anyToString(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return x
	case float64:
		// encoding/json 把数字解码成 float64；整数要去掉小数尾巴
		if x == float64(int64(x)) {
			return strconv.FormatInt(int64(x), 10)
		}
		return strconv.FormatFloat(x, 'f', -1, 64)
	case bool:
		if x {
			return "true"
		}
		return "false"
	default:
		return ""
	}
}
