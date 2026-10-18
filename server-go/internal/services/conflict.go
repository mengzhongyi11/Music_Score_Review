package services

import (
	"fmt"
	"math"
	"strings"

	"score-review/server-go/internal/notation"
)

// ConflictItem 一条冲突记录。
type ConflictItem struct {
	Type         string  `json:"type"`
	MeasureIndex *int    `json:"measureIndex,omitempty"`
	NoteIndex    *int    `json:"noteIndex,omitempty"`
	Field        *string `json:"field,omitempty"`
	MainValue    string  `json:"mainValue"`
	BranchValue  string  `json:"branchValue"`
	Description  string  `json:"description"`
}

// ConflictResult 冲突检测结果。
type ConflictResult struct {
	HasConflict bool           `json:"hasConflict"`
	Conflicts   []ConflictItem `json:"conflicts"`
	Summary     string         `json:"summary"`
}

// DiffInput 对比输入。Tempo 类字段可空。
type DiffInput struct {
	MainContent   *string
	BranchContent *string
	MainTempo     *string
	BranchTempo   *string
	MainKey       *string
	BranchKey     *string
	MainTime      *string
	BranchTime    *string
}

// DetectConflicts 是 server/src/services/conflictDetector.ts 的 Go 移植。
//
// ⚠ 已知既有缺陷，移植时**原样保留**以保证与 Node 版行为一致：
//  1. 音符对比按下标对齐（而非 LCS diff），中途插入音符会导致后续整体错位误报
//  2. 结构性校验里休止符/延音线的时值用了 beatUnit/Math.max(duration,4)，
//     把时值上限钳到 4，导致全休止(duration=1)与二分休止(duration=2)被算成 1 拍
//  3. 结构性校验只对分支做，未校验主库
//
// 是否修复属独立决策，不应夹在迁移里（见迁移计划的 R2）。
func DetectConflicts(input DiffInput) ConflictResult {
	conflicts := make([]ConflictItem, 0)

	mainParsed := notation.ParseJianpu(input.MainContent)
	branchParsed := notation.ParseJianpu(input.BranchContent)

	// ── 1) 头部对比 ──
	if mainParsed.Key != branchParsed.Key {
		conflicts = append(conflicts, ConflictItem{
			Type:        "key_signature",
			MainValue:   mainParsed.Key,
			BranchValue: branchParsed.Key,
			Description: fmt.Sprintf("调号变更：%s → %s", mainParsed.Key, branchParsed.Key),
		})
	}

	if mainParsed.TimeSignature != branchParsed.TimeSignature {
		conflicts = append(conflicts, ConflictItem{
			Type:        "time_signature",
			MainValue:   mainParsed.TimeSignature,
			BranchValue: branchParsed.TimeSignature,
			Description: fmt.Sprintf("拍号变更：%s → %s", mainParsed.TimeSignature, branchParsed.TimeSignature),
		})
	}

	// 速度：入参优先，其次取解析出的 tempo（TS 里 null → ''）
	mainTempo := firstNonNil(input.MainTempo, mainParsed.Tempo)
	branchTempo := firstNonNil(input.BranchTempo, branchParsed.Tempo)
	if mainTempo != "" && branchTempo != "" && mainTempo != branchTempo {
		conflicts = append(conflicts, ConflictItem{
			Type:        "tempo",
			MainValue:   mainTempo,
			BranchValue: branchTempo,
			Description: fmt.Sprintf("速度变更：%s → %s", mainTempo, branchTempo),
		})
	}

	// ── 2) 逐小节逐音符对比 ──
	maxMeasures := len(mainParsed.Measures)
	if len(branchParsed.Measures) > maxMeasures {
		maxMeasures = len(branchParsed.Measures)
	}

	for mi := 0; mi < maxMeasures; mi++ {
		mNotes := notesOf(mainParsed, mi)
		bNotes := notesOf(branchParsed, mi)

		maxNotes := len(mNotes)
		if len(bNotes) > maxNotes {
			maxNotes = len(bNotes)
		}

		for ni := 0; ni < maxNotes; ni++ {
			mn := atOrNil(mNotes, ni)
			bn := atOrNil(bNotes, ni)
			measureNo, noteNo := mi+1, ni+1

			if mn == nil || bn == nil {
				conflicts = append(conflicts, ConflictItem{
					Type:         "note_content",
					MeasureIndex: &measureNo,
					NoteIndex:    &noteNo,
					MainValue:    rawOr(mn, "(无)"),
					BranchValue:  rawOr(bn, "(无)"),
					Description:  fmt.Sprintf("第 %d 小节第 %d 个音：%s → %s（音符数量变更）", measureNo, noteNo, rawOr(mn, "无"), rawOr(bn, "无")),
				})
				continue
			}

			if mn.Pitch != bn.Pitch {
				conflicts = append(conflicts, ConflictItem{
					Type:         "note_content",
					MeasureIndex: &measureNo,
					NoteIndex:    &noteNo,
					MainValue:    mn.Raw,
					BranchValue:  bn.Raw,
					Description:  fmt.Sprintf("第 %d 小节第 %d 个音：音高 %s → %s", measureNo, noteNo, mn.Pitch, bn.Pitch),
				})
			}
			if mn.OctaveDots != bn.OctaveDots {
				conflicts = append(conflicts, ConflictItem{
					Type:         "note_content",
					MeasureIndex: &measureNo,
					NoteIndex:    &noteNo,
					MainValue:    mn.Raw,
					BranchValue:  bn.Raw,
					Description:  fmt.Sprintf("第 %d 小节第 %d 个音：八度变更（高音点 %d → %d）", measureNo, noteNo, mn.OctaveDots, bn.OctaveDots),
				})
			}
			if !strPtrEq(mn.Accidental, bn.Accidental) {
				conflicts = append(conflicts, ConflictItem{
					Type:         "note_content",
					MeasureIndex: &measureNo,
					NoteIndex:    &noteNo,
					MainValue:    mn.Raw,
					BranchValue:  bn.Raw,
					Description:  fmt.Sprintf("第 %d 小节第 %d 个音：变音号 %s → %s", measureNo, noteNo, strPtrVal(mn.Accidental), strPtrVal(bn.Accidental)),
				})
			}
			if mn.Duration != bn.Duration {
				conflicts = append(conflicts, ConflictItem{
					Type:         "note_content",
					MeasureIndex: &measureNo,
					NoteIndex:    &noteNo,
					MainValue:    mn.Raw,
					BranchValue:  bn.Raw,
					Description:  fmt.Sprintf("第 %d 小节第 %d 个音：时值 %d → %d", measureNo, noteNo, mn.Duration, bn.Duration),
				})
			}
		}
	}

	// ── 3) 结构性校验：每小节时值总和是否匹配拍号 ──
	beatsPerMeasure := branchParsed.TotalBeats
	beatUnit := branchParsed.BeatUnit
	if beatUnit == 0 {
		beatUnit = 4 // TS: branchParsed.beatUnit || 4
	}

	for mi, measure := range branchParsed.Measures {
		totalBeats := 0.0
		for _, n := range measure.Notes {
			if n.IsRest || n.IsExtension {
				// ⚠ 保留 TS 原式（含前述缺陷）：Math.max(n.duration, 4)
				d := n.Duration
				if d < 4 {
					d = 4
				}
				totalBeats += float64(beatUnit) / float64(d)
				continue
			}
			mult := 1.0
			if n.IsDot {
				mult = 1.5
			}
			totalBeats += (float64(beatUnit) / float64(n.Duration)) * mult
		}

		if math.Abs(totalBeats-float64(beatsPerMeasure)) > 0.01 {
			measureNo := mi + 1
			direction := "不足"
			if totalBeats > float64(beatsPerMeasure) {
				direction = "超出"
			}
			conflicts = append(conflicts, ConflictItem{
				Type:         "structural",
				MeasureIndex: &measureNo,
				MainValue:    fmt.Sprintf("%d 拍", beatsPerMeasure),
				BranchValue:  fmt.Sprintf("%.1f 拍", totalBeats),
				Description: fmt.Sprintf("第 %d 小节拍号 %s，应含 %d 拍，实际 %.1f 拍（时值%s）",
					measureNo, branchParsed.TimeSignature, beatsPerMeasure, totalBeats, direction),
			})
		}
	}

	// ── 汇总 ──
	hasConflict := len(conflicts) > 0
	summary := "主库与分支内容一致，无冲突"
	if hasConflict {
		descriptions := make([]string, 0, len(conflicts))
		for _, c := range conflicts {
			descriptions = append(descriptions, c.Description)
		}
		summary = fmt.Sprintf("检测到 %d 处差异：%s", len(conflicts), strings.Join(descriptions, "；"))
	}

	return ConflictResult{HasConflict: hasConflict, Conflicts: conflicts, Summary: summary}
}

/* ── 小工具 ── */

// notesOf 取第 mi 小节的音符并过滤掉延音线（与 TS 的 filter(n => !n.isExtension) 一致）。
func notesOf(score notation.ParsedScore, mi int) []notation.NoteToken {
	if mi >= len(score.Measures) {
		return nil
	}
	out := make([]notation.NoteToken, 0, len(score.Measures[mi].Notes))
	for _, n := range score.Measures[mi].Notes {
		if !n.IsExtension {
			out = append(out, n)
		}
	}
	return out
}

func atOrNil(notes []notation.NoteToken, i int) *notation.NoteToken {
	if i < 0 || i >= len(notes) {
		return nil
	}
	return &notes[i]
}

func rawOr(n *notation.NoteToken, fallback string) string {
	if n == nil {
		return fallback
	}
	return n.Raw
}

// firstNonNil 复刻 TS 的 `a || b || ''`：a 为空则取 b，再空则空串。
func firstNonNil(a, b *string) string {
	if a != nil && *a != "" {
		return *a
	}
	if b != nil && *b != "" {
		return *b
	}
	return ""
}

func strPtrEq(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func strPtrVal(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
