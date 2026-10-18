// Package notation 是 server/src/utils/notation.ts 的 Go 移植。
//
// 这是全项目迁移中风险最高的单文件：456 行密集的字符串/Unicode 处理。
// 移植原则是**行为逐字节对齐 Node 版**，包括其中的死代码与边界写法，
// 以便 testdata/notation_fixture.json（由 Node 版权威实现生成）能逐字段通过。
//
// 移植中需要特别处理的 JS 语义差异：
//   - JS 按 UTF-16 code unit 索引，Go 按 byte —— 所有「去掉一个前缀/后缀」
//     的地方用 TrimPrefix/TrimSuffix（多字节字符安全），而不是按长度切片
//   - JS 的 \s 包含全角空格 U+3000、NBSP 等，Go 的 \s 只有 [\t\n\f\r ]
//     —— 所有分词走 splitJSSpace
//   - JS parseInt('4abc') === 4，Go strconv.Atoi 会报错 —— 用 jsAtoi
package notation

import (
	"regexp"
	"strconv"
	"strings"
)

/* ── 数据结构（JSON 字段名与 TS 接口逐一对齐） ── */

// ChordSubNote 和弦内的单个音。
type ChordSubNote struct {
	Pitch      string  `json:"pitch"`
	OctaveDots int     `json:"octaveDots"`
	Accidental *string `json:"accidental,omitempty"` // TS: accidental?: string
}

// NoteToken 一个音符的全部记谱属性。
type NoteToken struct {
	Raw          string         `json:"raw"`
	Pitch        string         `json:"pitch"`
	OctaveDots   int            `json:"octaveDots"`
	Duration     int            `json:"duration"`
	IsDot        bool           `json:"isDot"`
	IsStaccato   bool           `json:"isStaccato"`
	IsAccent     bool           `json:"isAccent"`
	IsTenuto     bool           `json:"isTenuto"`
	HasTie       bool           `json:"hasTie"`
	HasTieEnd    bool           `json:"hasTieEnd"`
	IsRest       bool           `json:"isRest"`
	IsExtension  bool           `json:"isExtension"`
	IsSlurStart  bool           `json:"isSlurStart"`
	IsSlurEnd    bool           `json:"isSlurEnd"`
	Accidental   *string        `json:"accidental,omitempty"` // TS: accidental?: string
	Dynamics     string         `json:"dynamics"`
	Articulation string         `json:"articulation"`
	Fermata      bool           `json:"fermata"`
	IsChord      *bool          `json:"isChord,omitempty"`    // TS: isChord?: boolean
	ChordNotes   []ChordSubNote `json:"chordNotes,omitempty"` // TS: chordNotes?: ChordSubNote[]
}

// ParsedMeasure 一个小节。
type ParsedMeasure struct {
	Notes       []NoteToken `json:"notes"`
	Barline     string      `json:"barline"`
	Beats       *string     `json:"beats,omitempty"`       // TS: beats?: string
	HasTieStart *bool       `json:"hasTieStart,omitempty"` // TS: hasTieStart?: boolean
	HasTieEnd   *bool       `json:"hasTieEnd,omitempty"`   // TS: hasTieEnd?: boolean
}

// ParsedScore 整份谱面。
type ParsedScore struct {
	Key           string          `json:"key"`
	TimeSignature string          `json:"timeSignature"`
	Tempo         *string         `json:"tempo"` // TS: string | null —— 无 omitempty，nil 输出 null
	Measures      []ParsedMeasure `json:"measures"`
	TotalBeats    int             `json:"totalBeats"`
	BeatUnit      int             `json:"beatUnit"`
}

/* ── JS 语义辅助 ── */

// isJSSpace 复刻 JS 正则 \s 的字符集。
// Go 的 \s 只有 [\t\n\f\r ]，而 JS 还包含全角空格、NBSP、BOM 等——
// 简谱内容与 GB/T 文档里全角空格很常见，直接用 Go 的 \s 会解析结果不同。
func isJSSpace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ',
		0x00A0, // NBSP
		0x1680,
		0x2028, 0x2029,
		0x202F, // narrow NBSP
		0x205F,
		0x3000, // 全角空格
		0xFEFF: // BOM
		return true
	}
	return r >= 0x2000 && r <= 0x200A
}

// splitJSSpace 等价于 JS 的 s.split(/\s+/).filter(Boolean)。
func splitJSSpace(s string) []string {
	var out []string
	var cur strings.Builder
	flush := func() {
		if cur.Len() > 0 {
			out = append(out, cur.String())
			cur.Reset()
		}
	}
	for _, r := range s {
		if isJSSpace(r) {
			flush()
			continue
		}
		cur.WriteRune(r)
	}
	flush()
	return out
}

// jsAtoi 复刻 JS parseInt 的宽松语义：取前导整数，解析不出则返回 0。
// 调用方统一用 `|| 默认值` 兜底，与 JS 的 NaN || default 行为一致。
func jsAtoi(s string) int {
	i, neg := 0, false
	if i < len(s) && (s[i] == '-' || s[i] == '+') {
		neg = s[i] == '-'
		i++
	}
	start := i
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		i++
	}
	if i == start {
		return 0
	}
	n, err := strconv.Atoi(s[start:i])
	if err != nil {
		return 0
	}
	if neg {
		return -n
	}
	return n
}

// onlyDigits 等价于 JS 的 s.replace(/[^\d]/g, '')。
func onlyDigits(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func strPtr(s string) *string { return &s }
func boolPtr(b bool) *bool    { return &b }

/* ── 正则（全部 RE2 兼容） ── */

var (
	reChord          = regexp.MustCompile(`^\[([^\]]*)\](.*)$`)
	reBeats          = regexp.MustCompile(`^\[([0-9+]+)\]`)
	reRestOnly       = regexp.MustCompile(`^0-*$`)
	reHyphenOnly     = regexp.MustCompile(`^--?$`)
	reSuffixHyphen   = regexp.MustCompile(`-+$`)
	reSuffixUnder    = regexp.MustCompile(`_+$`)
	reDotAbove       = regexp.MustCompile(`^˙+`)
	reDotBelow       = regexp.MustCompile(`^\.+`)
	reApostrophePre  = regexp.MustCompile(`^'+`)
	reApostropheSuf  = regexp.MustCompile(`'+$`)
	reDynamics       = regexp.MustCompile(`-(f{1,2}|p{1,2}|m[fp]|s[fz]|sf[zp])$`)
	reArticulation   = regexp.MustCompile(`\.(tr|trem|arp|gliss|mord|turn)$`)
	reChordSpaceMark = regexp.MustCompile(`\[([^\]]+)\]`)
)

/* ── 主入口 ── */

// ParseJianpu 解析简谱内容。与 TS 版 parseJianpu 行为一致。
func ParseJianpu(content *string) ParsedScore {
	result := ParsedScore{
		Key:           "1=C",
		TimeSignature: "4/4",
		Tempo:         nil,
		Measures:      make([]ParsedMeasure, 0),
		TotalBeats:    4,
		BeatUnit:      4,
	}

	if content == nil || strings.TrimSpace(*content) == "" {
		return result
	}

	// lines = content.split('\n').filter(Boolean)
	var lines []string
	for _, l := range strings.Split(*content, "\n") {
		if l != "" {
			lines = append(lines, l)
		}
	}

	// headerLine = lines.find(l => l.startsWith('1='))
	for _, l := range lines {
		if !strings.HasPrefix(l, "1=") {
			continue
		}
		parts := splitJSSpace(strings.TrimSpace(l))
		if len(parts) > 0 {
			result.Key = parts[0]
		} else {
			result.Key = "1=C"
		}
		if len(parts) > 1 {
			result.TimeSignature = parts[1]
		} else {
			result.TimeSignature = "4/4"
		}
		// parts.slice(2).join(' ') || null
		if len(parts) > 2 {
			result.Tempo = strPtr(strings.Join(parts[2:], " "))
		} else {
			result.Tempo = nil
		}

		ts := strings.Split(result.TimeSignature, "/")
		if len(ts) > 0 {
			if v := jsAtoi(ts[0]); v != 0 {
				result.TotalBeats = v
			}
		}
		if len(ts) > 1 {
			if v := jsAtoi(ts[1]); v != 0 {
				result.BeatUnit = v
			}
		}
		break
	}

	// contentLines = lines.filter(l => !l.startsWith('1=') && l.trim())
	var contentLines []string
	for _, l := range lines {
		if strings.HasPrefix(l, "1=") || strings.TrimSpace(l) == "" {
			continue
		}
		contentLines = append(contentLines, l)
	}
	if len(contentLines) == 0 {
		return result
	}

	for _, line := range contentLines {
		clean := strings.TrimSpace(line)
		clean = strings.TrimPrefix(clean, "|")

		// clean.split('|').filter(Boolean)
		var measureStrs []string
		for _, m := range strings.Split(clean, "|") {
			if m != "" {
				measureStrs = append(measureStrs, m)
			}
		}

		for m := 0; m < len(measureStrs); m++ {
			raw := strings.TrimSpace(measureStrs[m])

			// 注意：TS 版此处写成 `isLast ? 'single' : 'single'`（两个分支同值），
			// 属死代码；且 `||` 会先被上面的 split('|') 吃掉，导致 endsWith('||')
			// 分支实际上几乎不触发。此处原样保留，保证行为一致。
			barline := "single"
			if strings.HasSuffix(raw, "||") {
				barline = "double"
				raw = strings.TrimSpace(strings.TrimSuffix(raw, "||"))
			} else if strings.HasSuffix(raw, "‖") {
				barline = "end"
				raw = strings.TrimSpace(strings.TrimSuffix(raw, "‖"))
			}

			var beats *string
			if bm := reBeats.FindStringSubmatch(raw); bm != nil {
				beats = strPtr(bm[1])
				raw = strings.TrimSpace(raw[len(bm[0]):])
			}

			noteStrs := tokenizeMeasureWithChords(raw)
			notes := make([]NoteToken, 0, len(noteStrs))
			for _, ns := range noteStrs {
				notes = append(notes, ParseNoteToken(ns, result.BeatUnit))
			}
			result.Measures = append(result.Measures, ParsedMeasure{
				Notes: notes, Barline: barline, Beats: beats,
			})
		}
	}

	return result
}

// ParseNoteToken 解析单个音符标记（含和弦检测）。
func ParseNoteToken(raw string, beatUnit int) NoteToken {
	if strings.HasPrefix(raw, "[") {
		return ParseChordToken(raw, beatUnit)
	}
	return parseSingleNoteToken(raw, beatUnit)
}

// tokenizeMeasureWithChords 和弦感知分词：方括号内的空格不分割。
// TS 版把 [] 内的空格替换成 \x00 哨兵再 split，最后还原。
func tokenizeMeasureWithChords(raw string) []string {
	escaped := reChordSpaceMark.ReplaceAllStringFunc(raw, func(m string) string {
		return strings.ReplaceAll(m, " ", "\x00")
	})
	tokens := splitJSSpace(escaped)
	for i, t := range tokens {
		tokens[i] = strings.ReplaceAll(t, "\x00", " ")
	}
	return tokens
}

// ParseChordToken 解析和弦标记，格式如 [1 3 5]- 或 [˙1 3 .5]。
func ParseChordToken(raw string, beatUnit int) NoteToken {
	defaultDuration := 4
	if beatUnit == 8 {
		defaultDuration = 8
	}

	m := reChord.FindStringSubmatch(raw)
	if m == nil {
		return parseSingleNoteToken(raw, beatUnit)
	}
	inner := strings.TrimSpace(m[1])
	suffix := m[2]

	parts := splitJSSpace(inner)
	chordNotes := make([]ChordSubNote, 0, len(parts))
	for _, p := range parts {
		chordNotes = append(chordNotes, parseChordSubNote(p))
	}
	if len(chordNotes) == 0 {
		return parseSingleNoteToken("0", beatUnit)
	}

	// pitch = chordNotes.map(n => n.pitch).join('')
	var pitchBuilder strings.Builder
	for _, n := range chordNotes {
		pitchBuilder.WriteString(n.Pitch)
	}

	token := NoteToken{
		Raw:        raw,
		Pitch:      pitchBuilder.String(),
		OctaveDots: 0,
		Duration:   defaultDuration,
		IsChord:    boolPtr(true),
		ChordNotes: chordNotes,
	}

	w := suffix
	if strings.HasPrefix(w, "~") {
		token.HasTieEnd = true
		w = w[1:]
	}
	if strings.HasSuffix(w, "~") {
		token.HasTie = true
		w = strings.TrimSuffix(w, "~")
	}
	if strings.HasSuffix(w, ".") {
		token.IsStaccato = true
		w = strings.TrimSuffix(w, ".")
	}
	if strings.Contains(w, ">") {
		token.IsAccent = true
		w = strings.Replace(w, ">", "", 1)
	}

	underMatch := reSuffixUnder.FindString(w)
	hasUnder := underMatch != ""
	if hasUnder {
		uc := len(underMatch)
		switch {
		case uc >= 3:
			token.Duration = 32
		case uc == 2:
			token.Duration = 16
		case uc == 1:
			token.Duration = 8
		}
		w = w[:len(w)-uc]
	}

	hyphenMatch := reSuffixHyphen.FindString(w)
	if hyphenMatch != "" && !hasUnder {
		hc := len(hyphenMatch)
		switch {
		case hc >= 3:
			token.Duration = 1
		case hc == 2:
			token.Duration = 2
			token.IsDot = true
		case hc == 1:
			token.Duration = 2
		}
		w = w[:len(w)-hc]
	}
	return token
}

// parseChordSubNote 解析和弦内的单个音（音高 + 八度 + 变音）。
func parseChordSubNote(text string) ChordSubNote {
	work := strings.TrimSpace(text)
	var acc *string
	dots := 0

	if strings.HasPrefix(work, "#") {
		acc = strPtr("#")
		work = work[1:]
	} else if strings.HasPrefix(work, "b") {
		acc = strPtr("b")
		work = work[1:]
	}

	// 高音点 ˙
	if hi := reDotAbove.FindString(work); hi != "" {
		dots = len([]rune(hi))
		work = work[len(hi):]
	}
	// 低音点 .
	if lo := reDotBelow.FindString(work); lo != "" {
		dots = -len([]rune(lo))
		work = work[len(lo):]
	}

	pitch := onlyDigits(work)
	if pitch == "" {
		pitch = "1"
	}
	return ChordSubNote{Pitch: pitch, OctaveDots: dots, Accidental: acc}
}

// parseSingleNoteToken 解析单个普通音符。
func parseSingleNoteToken(raw string, beatUnit int) NoteToken {
	defaultDuration := 4
	if beatUnit == 8 {
		defaultDuration = 8
	}

	token := NoteToken{
		Raw:        raw,
		Duration:   defaultDuration,
		Accidental: nil,
	}

	// 休止符（0, 0-, 0--, 0---）
	if strings.HasPrefix(raw, "0") && reRestOnly.MatchString(raw) {
		token.IsRest = true
		token.Pitch = "0"
		if h := reSuffixHyphen.FindString(raw); h != "" {
			switch hc := len(h); {
			case hc >= 3:
				token.Duration = 1 // 全休止
			case hc == 2:
				token.Duration = 2 // 附点二分休止
				token.IsDot = true
			case hc == 1:
				token.Duration = 2 // 二分休止
			}
		}
		return token
	}

	// 延音线（增时线）
	if reHyphenOnly.MatchString(raw) || raw == "—" {
		token.IsExtension = true
		return token
	}

	work := raw

	// 圆滑线
	if strings.HasPrefix(work, "(") {
		token.IsSlurStart = true
		work = work[1:]
	}
	if strings.HasSuffix(work, ")") {
		token.IsSlurEnd = true
		work = strings.TrimSuffix(work, ")")
	}

	// 同音连线
	if strings.HasPrefix(work, "~") {
		token.HasTieEnd = true
		work = work[1:]
	}
	if strings.HasSuffix(work, "~") {
		token.HasTie = true
		work = strings.TrimSuffix(work, "~")
	}

	// 变音号（前缀 #, ♮, b；后缀 #）
	switch {
	case strings.HasPrefix(work, "#"):
		token.Accidental = strPtr("#")
		work = work[1:]
	case strings.HasPrefix(work, "♮"):
		token.Accidental = strPtr("n")
		work = work[len("♮"):]
	case strings.HasPrefix(work, "b") && len(work) > 1 && isDigitByte(work[1]):
		token.Accidental = strPtr("b")
		work = work[1:]
	case len(work) > 1 && strings.HasSuffix(work, "#") && isDigitByte(work[len(work)-2]):
		token.Accidental = strPtr("#")
		work = work[:len(work)-1]
	}

	// 断音 .（后缀；前缀 . 是低八度记号）
	if strings.HasSuffix(work, ".") && !strings.HasSuffix(work, "..") {
		token.IsStaccato = true
		work = strings.TrimSuffix(work, ".")
	}

	// 重音 >
	if strings.Contains(work, ">") {
		token.IsAccent = true
		work = strings.Replace(work, ">", "", 1)
	}

	// 保持音 -
	if strings.HasPrefix(work, "-") && len(work) > 1 {
		// 排除延音线：后一个字符既不是 '-' 也不是数字
		if work[1] != '-' && !isDigitByte(work[1]) {
			token.IsTenuto = true
			work = work[1:]
		}
	}

	// 延长号 ^
	if strings.Contains(work, "^") {
		token.Fermata = true
		work = strings.Replace(work, "^", "", 1)
	}

	// 力度标记
	if dm := reDynamics.FindStringSubmatch(work); dm != nil {
		token.Dynamics = dm[1]
		work = work[:len(work)-len(dm[1])-1]
	}

	// 演奏法
	if am := reArticulation.FindStringSubmatch(work); am != nil {
		token.Articulation = am[1]
		work = work[:len(work)-len(am[1])-1]
	}

	// ── 高低音点（三种写法） ──
	text := work

	// combining macron U+0305（高音）
	if strings.Contains(text, "̅") {
		token.OctaveDots = strings.Count(text, "̅")
		text = strings.ReplaceAll(text, "̅", "")
	}
	// dot above ˙ U+02D9（高音）
	if dm := reDotAbove.FindString(text); dm != "" {
		token.OctaveDots = len([]rune(dm))
		text = text[len(dm):]
	}
	// 撇号 '（高音，前缀或后缀）
	apos := reApostrophePre.FindString(text)
	if apos == "" {
		apos = reApostropheSuf.FindString(text)
	}
	if apos != "" {
		token.OctaveDots += len(apos)
		text = strings.ReplaceAll(text, "'", "")
	}
	// 低音点 .（前缀）
	if lo := reDotBelow.FindString(text); lo != "" {
		token.OctaveDots = -len([]rune(lo))
		text = text[len(lo):]
	}

	// 附点 •
	if strings.Contains(text, "•") {
		token.IsDot = true
		text = strings.Replace(text, "•", "", 1)
	}

	// 减时线（下划线）
	underMatch := reSuffixUnder.FindString(text)
	hasUnder := underMatch != ""
	if hasUnder {
		uc := len(underMatch)
		switch {
		case uc >= 3:
			token.Duration = 32
		case uc == 2:
			token.Duration = 16
		case uc == 1:
			token.Duration = 8
		}
		text = text[:len(text)-uc]
	}

	// 增时线（连字符）
	if h := reSuffixHyphen.FindString(text); h != "" && !hasUnder {
		hc := len(h)
		switch {
		case hc >= 3:
			token.Duration = 1 // 全音符
		case hc == 2:
			token.Duration = 2 // 附点二分
			token.IsDot = true
		case hc == 1:
			token.Duration = 2 // 二分音符
		}
		text = text[:len(text)-hc]
	}

	token.Pitch = onlyDigits(text)
	if token.Pitch == "" {
		token.Pitch = "1"
	}

	return token
}

func isDigitByte(b byte) bool { return b >= '0' && b <= '9' }
