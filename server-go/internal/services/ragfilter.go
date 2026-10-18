package services

import (
	"strings"

	"score-review/server-go/internal/rules"
)

// MatchedRule RAG 命中的规则摘要。
type MatchedRule struct {
	SectionID string `json:"sectionId"`
	Title     string `json:"title"`
	Score     int    `json:"score"`
}

// RagFilterResult Layer 2 结果。可选字段用 omitempty 对齐 TS 的 `x?:`。
type RagFilterResult struct {
	Passed       bool          `json:"passed"`
	Reason       string        `json:"reason,omitempty"`
	Context      string        `json:"context,omitempty"`
	MatchedRules []MatchedRule `json:"matchedRules,omitempty"`
}

// ragMinScore 与 TS 版硬编码的 `matches[0].score < 5` 一致。
const ragMinScore = 5

// RagFilter 是 Layer 2 规则知识库过滤。
//
// ⚠ 已知缺陷（照搬未改）：向量路径的分数是 round(余弦×100)（0~100 尺度），
// 关键词路径是加权小整数（3~30），两条路径却共用同一个阈值。
// 是否修复属独立决策，见迁移计划 R2。
func RagFilter(kb *rules.KnowledgeBase, input string) RagFilterResult {
	text := strings.TrimSpace(input)
	if text == "" {
		return RagFilterResult{Passed: false, Reason: "内容为空"}
	}

	matches := kb.SearchKeyword(text, 3)
	if len(matches) == 0 || matches[0].Score < ragMinScore {
		return RagFilterResult{
			Passed: false,
			Reason: "内容与简谱记谱规范无关联，建议确认是否为有效审阅意见",
		}
	}

	// matchedRules 只保留达到阈值的项
	matchedRules := make([]MatchedRule, 0, len(matches))
	for _, m := range matches {
		if m.Score >= ragMinScore {
			matchedRules = append(matchedRules, MatchedRule{
				SectionID: m.Entry.SectionID,
				Title:     m.Entry.Title,
				Score:     m.Score,
			})
		}
	}

	// context 用**未过滤**的 matches（与 TS 一致），描述截断到 100 字符
	parts := make([]string, 0, len(matches))
	for _, m := range matches {
		parts = append(parts, "§"+m.Entry.SectionID+" "+m.Entry.Title+"："+truncateRunes(m.Entry.Description, 100))
	}

	return RagFilterResult{
		Passed:       true,
		Context:      strings.Join(parts, "\n"),
		MatchedRules: matchedRules,
	}
}

// truncateRunes 复刻 JS 的 slice(0, n)：按字符数截断而不是字节数。
func truncateRunes(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n])
}
