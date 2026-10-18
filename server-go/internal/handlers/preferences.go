package handlers

import (
	"encoding/json"
	"net/http"
	"sort"

	"github.com/gin-gonic/gin"

	"score-review/server-go/internal/httpx"
	"score-review/server-go/internal/services"
)

type preferenceItem struct {
	PreferenceKey   string          `json:"preference_key" db:"preference_key"`
	PreferenceValue json.RawMessage `json:"preference_value" db:"preference_value"`
}

type preferencesStatsResponse struct {
	Stats       services.ReviewStats `json:"stats"`
	Preferences []preferenceItem     `json:"preferences"`
}

// errKeywordOrder 与 Node 的关键词数组顺序一致（决定并列时的排序稳定性）。
var errKeywordOrder = []string{"力度", "速度", "调号", "拍号", "音高", "音符", "连音", "小节", "和弦"}

// GetPreferenceStats GET /api/preferences/:userId/stats
func (h *Handler) GetPreferenceStats(c *gin.Context) {
	ctx := c.Request.Context()
	userID := c.Param("userId")

	// ① 审阅建议处理情况。
	// ⚠ SUM 在无匹配行时返回 NULL，必须用指针接收，否则 sqlx 扫描报错。
	var agg struct {
		Total      int   `db:"total"`
		Accepted   *int  `db:"accepted"`
		Rejected   *int  `db:"rejected"`
		Dismissed  *int  `db:"dismissed"`
		AIAccepted *int  `db:"ai_accepted"`
		AITotal    *int  `db:"ai_total"`
	}
	if err := h.App.DB.GetContext(ctx, &agg,
		`SELECT
		   COUNT(*) as total,
		   SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
		   SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
		   SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) as dismissed,
		   SUM(CASE WHEN status = 'accepted' AND layer = 'ai' THEN 1 ELSE 0 END) as ai_accepted,
		   SUM(CASE WHEN layer = 'ai' THEN 1 ELSE 0 END) as ai_total
		 FROM review_suggestions
		 WHERE reviewed_by = ? OR created_by = ?`, userID, userID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	// ② 从被驳回的建议里按关键词聚合"常见错误"
	contents := make([]*string, 0)
	if err := h.App.DB.SelectContext(ctx, &contents,
		"SELECT content FROM review_suggestions WHERE reviewed_by = ? AND status = 'rejected'",
		userID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	// 用「有序切片 + 计数」而不是 map：JS 的 Map 保插入顺序，
	// 并列时排序结果依赖这个顺序，用 Go map 会漂移。
	type kwCount struct {
		Type  string
		Count int
	}
	ordered := make([]kwCount, 0, len(errKeywordOrder))
	counts := make(map[string]int, len(errKeywordOrder))
	for _, e := range contents {
		text := strOr(e, "")
		for _, kw := range errKeywordOrder {
			if containsStr(text, kw) {
				if _, seen := counts[kw]; !seen {
					ordered = append(ordered, kwCount{Type: kw})
				}
				counts[kw]++
				break // 每条内容只计一次
			}
		}
	}
	for i := range ordered {
		ordered[i].Count = counts[ordered[i].Type]
	}
	sort.SliceStable(ordered, func(a, b int) bool { return ordered[a].Count > ordered[b].Count })

	commonErrors := make([]services.CommonError, 0, len(ordered))
	for _, kc := range ordered {
		commonErrors = append(commonErrors, services.CommonError{Type: kc.Type, Count: kc.Count})
	}

	stats := services.CalculateStats(services.StatsInput{
		Total:         agg.Total,
		Accepted:      intOrZero(agg.Accepted),
		Rejected:      intOrZero(agg.Rejected),
		Dismissed:     intOrZero(agg.Dismissed),
		AISuggestions: intOrZero(agg.AITotal),
		AIAccepted:    intOrZero(agg.AIAccepted),
		CommonErrors:  commonErrors,
	})

	// ③ 用户偏好
	prefs := make([]preferenceItem, 0)
	if err := h.App.DB.SelectContext(ctx, &prefs,
		"SELECT preference_key, preference_value FROM user_preferences WHERE user_id = ?", userID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	httpx.OK(c, preferencesStatsResponse{Stats: stats, Preferences: prefs})
}

// UpdatePreferences PUT /api/preferences/:userId
func (h *Handler) UpdatePreferences(c *gin.Context) {
	var body struct {
		Preferences []struct {
			Key    string  `json:"key"`
			Value  any     `json:"value"`
			Weight float64 `json:"weight"`
		} `json:"preferences"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Preferences == nil {
		httpx.Fail(c, http.StatusBadRequest, "preferences 需为数组")
		return
	}

	ctx := c.Request.Context()
	userID := c.Param("userId")

	for _, pref := range body.Preferences {
		encoded, err := json.Marshal(pref.Value)
		if err != nil {
			continue
		}
		// Node: pref.weight || 1.0 —— 0 和缺省都取 1.0
		weight := pref.Weight
		if weight == 0 {
			weight = 1.0
		}
		if _, err := h.App.DB.ExecContext(ctx,
			`INSERT INTO user_preferences (user_id, preference_key, preference_value, weight)
			 VALUES (?, ?, ?, ?)
			 ON DUPLICATE KEY UPDATE preference_value = VALUES(preference_value), weight = VALUES(weight)`,
			userID, pref.Key, string(encoded), weight); err != nil {
			httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
			return
		}
	}

	httpx.OK(c, messageResponse{Message: "偏好已更新"})
}

type checkRejectResponse struct {
	Matched  bool     `json:"matched"`
	Patterns []string `json:"patterns"`
}

// CheckReject POST /api/preferences/check-reject
func (h *Handler) CheckReject(c *gin.Context) {
	var body struct {
		Content *string `json:"content"`
		UserID  *int    `json:"user_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "缺少 content")
		return
	}
	if body.Content == nil || *body.Content == "" {
		httpx.Fail(c, http.StatusBadRequest, "缺少 content")
		return
	}

	userID := 1
	if body.UserID != nil {
		userID = *body.UserID
	}

	var raw []json.RawMessage
	if err := h.App.DB.SelectContext(c.Request.Context(), &raw,
		"SELECT preference_value FROM user_preferences WHERE user_id = ? AND preference_key = 'rejected_patterns'",
		userID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	patterns := make([]string, 0)
	if len(raw) > 0 {
		patterns = decodePatterns(raw[0])
	}

	httpx.OK(c, checkRejectResponse{
		Matched:  services.ShouldAutoReject(*body.Content, patterns),
		Patterns: patterns,
	})
}

type aiStatsResponse struct {
	GlobalStats aiStats `json:"globalStats"`
}

// aiStats 的 SUM 字段用 *string：
// MySQL 的 SUM() 返回 DECIMAL，mysql2 会把它序列化成**字符串**（如 "21"），
// 而 COUNT() 返回 BIGINT 会序列化成数字。要逐字节对齐就必须照抄这个差异。
// 无匹配行时 SUM 为 NULL → 指针为 nil → 输出 null，与 Node 一致。
type aiStats struct {
	Total         int     `json:"total" db:"total"`
	RuleCount     *string `json:"rule_count" db:"rule_count"`
	RagCount      *string `json:"rag_count" db:"rag_count"`
	AiCount       *string `json:"ai_count" db:"ai_count"`
	AcceptedCount *string `json:"accepted_count" db:"accepted_count"`
}

// GetAIStats GET /api/preferences/ai-stats —— 跨用户全局统计
func (h *Handler) GetAIStats(c *gin.Context) {
	var stats aiStats
	if err := h.App.DB.GetContext(c.Request.Context(), &stats,
		`SELECT
		   COUNT(*) as total,
		   SUM(CASE WHEN layer = 'rule' THEN 1 ELSE 0 END) as rule_count,
		   SUM(CASE WHEN layer = 'rag' THEN 1 ELSE 0 END) as rag_count,
		   SUM(CASE WHEN layer = 'ai' THEN 1 ELSE 0 END) as ai_count,
		   SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted_count
		 FROM review_suggestions`); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	httpx.OK(c, aiStatsResponse{GlobalStats: stats})
}

/* ── 工具 ── */

func intOrZero(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

func containsStr(s, sub string) bool {
	return len(sub) > 0 && len(s) >= len(sub) && indexOf(s, sub) >= 0
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

// decodePatterns 兼容 preference_value 是 JSON 数组或 JSON 字符串两种形态。
func decodePatterns(raw json.RawMessage) []string {
	var direct []string
	if err := json.Unmarshal(raw, &direct); err == nil {
		return direct
	}
	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		var nested []string
		if err := json.Unmarshal([]byte(asString), &nested); err == nil {
			return nested
		}
	}
	return []string{}
}
