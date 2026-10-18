package services

import (
	"fmt"
	"math"
	"regexp"
	"strconv"

	"score-review/server-go/internal/notation"
)

// ImpactItem 一条影响项。
type ImpactItem struct {
	Type        string `json:"type"`
	Severity    string `json:"severity"`
	Description string `json:"description"`
	Suggestion  string `json:"suggestion"`
}

// ImpactResult 影响分析结果。
type ImpactResult struct {
	SectionID   string       `json:"sectionId"`
	SectionName string       `json:"sectionName"`
	OverallRisk string       `json:"overallRisk"`
	Impacts     []ImpactItem `json:"impacts"`
}

// ImpactInput 分析输入。
type ImpactInput struct {
	SectionID     string
	SectionName   string
	MainContent   *string
	BranchContent *string
}

var reBPM = regexp.MustCompile(`(\d+)`)

// AnalyzeSectionImpact 是 server/src/services/impactAnalyzer.ts 的 Go 移植，
// 纯规则层、零 AI 成本。
func AnalyzeSectionImpact(input ImpactInput) ImpactResult {
	impacts := make([]ImpactItem, 0)

	mainParsed := notation.ParseJianpu(input.MainContent)
	branchParsed := notation.ParseJianpu(input.BranchContent)

	// ── 1) 速度变化 ──
	mainTempo := strPtrVal(mainParsed.Tempo)
	branchTempo := strPtrVal(branchParsed.Tempo)
	if mainTempo != "" && branchTempo != "" && mainTempo != branchTempo {
		mainBPM, okMain := ExtractBPM(mainTempo)
		branchBPM, okBranch := ExtractBPM(branchTempo)
		if okMain && okBranch {
			diff := int(math.Abs(float64(mainBPM - branchBPM)))
			switch {
			case diff > 20:
				impacts = append(impacts, ImpactItem{
					Type:        "tempo",
					Severity:    "high",
					Description: fmt.Sprintf("速度变化 %d BPM（%d → %d），超过 20 BPM 阈值", diff, mainBPM, branchBPM),
					Suggestion:  "大幅速度变化会影响乐章整体风格和演奏效果，建议确认是否必要",
				})
			case diff > 10:
				impacts = append(impacts, ImpactItem{
					Type:        "tempo",
					Severity:    "medium",
					Description: fmt.Sprintf("速度变化 %d BPM（%d → %d）", diff, mainBPM, branchBPM),
					Suggestion:  "中等速度调整，需确保与相邻乐章的速度对比合理",
				})
			}
		}
	}

	// ── 2) 调号变化 ──
	if mainParsed.Key != branchParsed.Key {
		impacts = append(impacts, ImpactItem{
			Type:        "key",
			Severity:    "high",
			Description: fmt.Sprintf("调号从 %s 改为 %s", mainParsed.Key, branchParsed.Key),
			Suggestion:  "调号变更影响全曲音高体系，需确认是否为有意转调",
		})
	}

	// ── 3) 拍号变化 ──
	if mainParsed.TimeSignature != branchParsed.TimeSignature {
		impacts = append(impacts, ImpactItem{
			Type:        "structure",
			Severity:    "high",
			Description: fmt.Sprintf("拍号从 %s 改为 %s", mainParsed.TimeSignature, branchParsed.TimeSignature),
			Suggestion:  "拍号变更影响全部小节的重音结构和节拍划分",
		})
	}

	// ── 4) 内容长度大幅变化 ──
	mainNoteCount := countNotes(mainParsed)
	branchNoteCount := countNotes(branchParsed)
	if mainNoteCount > 0 && branchNoteCount > 0 {
		ratio := float64(maxInt(mainNoteCount, branchNoteCount)) / float64(minInt(mainNoteCount, branchNoteCount))
		if ratio > 1.5 {
			impacts = append(impacts, ImpactItem{
				Type:        "structure",
				Severity:    "high",
				Description: fmt.Sprintf("音符数量大幅变化（%d → %d，比例 %.1fx）", mainNoteCount, branchNoteCount, ratio),
				Suggestion:  "内容长度变化超过 50%，建议检查是否有遗漏或多余小节",
			})
		}
	}

	// ── 汇总风险等级 ──
	high, med := 0, 0
	for _, i := range impacts {
		switch i.Severity {
		case "high":
			high++
		case "medium":
			med++
		}
	}
	overall := "low"
	if high > 0 {
		overall = "high"
	} else if med > 0 {
		overall = "medium"
	}

	sectionID := input.SectionID
	if sectionID == "" {
		sectionID = "unknown" // TS: input.sectionId || 'unknown'
	}

	return ImpactResult{
		SectionID:   sectionID,
		SectionName: input.SectionName,
		OverallRisk: overall,
		Impacts:     impacts,
	}
}

// ExtractBPM 从速度文本提取 BPM，如 "♩=120" → 120。
// 返回 (值, 是否解析成功)，对应 TS 的 number | null。
func ExtractBPM(tempoText string) (int, bool) {
	m := reBPM.FindStringSubmatch(tempoText)
	if m == nil {
		return 0, false
	}
	n, err := strconv.Atoi(m[1])
	if err != nil {
		return 0, false
	}
	return n, true
}

func countNotes(score notation.ParsedScore) int {
	total := 0
	for _, m := range score.Measures {
		total += len(m.Notes)
	}
	return total
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
