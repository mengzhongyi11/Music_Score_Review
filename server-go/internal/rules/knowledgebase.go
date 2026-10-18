package rules

import (
	"regexp"
	"sort"
	"strings"
	"sync"
)

/* ── 数据结构（JSON 字段名与 TS 接口对齐） ── */

// Entry 一条规则。
type Entry struct {
	SectionID   string   `json:"sectionId"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Keywords    []string `json:"keywords"`
}

// Match 一条检索结果。
type Match struct {
	Entry           Entry    `json:"entry"`
	Score           int      `json:"score"`
	MatchedKeywords []string `json:"matchedKeywords"`
}

/*
 * ⚠ 高危差异：JS 的 \s 包含全角空格 U+3000、NBSP 等，Go 的 \s 只有 [\t\n\f\r ]。
 * GB/T 文档里章节号与标题之间用的正是全角空格（如 "5.2.1　小节线"），
 * 若直接用 Go 的 \s，章节标题会完全匹配不上，规则库直接为空。
 * 因此下面所有空白匹配都走显式字符类。
 */
const wsClass = `[\t\n\v\f\r \x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]`

var (
	// Node: /^(\d+(?:\.\d+)+)\s+(.+)$/
	reSection = regexp.MustCompile(`^(\d+(?:\.\d+)+)` + wsClass + `+(.+)$`)
	// Node: /^###\s+(.+)$/
	reH3 = regexp.MustCompile(`^###` + wsClass + `+(.+)$`)
	// Node: /^[A-Z][a-zA-Z\s]+$/
	reEnglishTitle = regexp.MustCompile("^[A-Z][a-zA-Z" + wsClass + "]+$")
	// Node: /^[0-9]+$/
	reDigitsOnly = regexp.MustCompile(`^[0-9]+$`)
	// Node: /^[A-Z][a-z]+$/
	reCapitalizedWord = regexp.MustCompile(`^[A-Z][a-z]+$`)
	// Node: /^[一-鿿]{2}$/ 与 /^[一-鿿]{3}$/
	reCJK2 = regexp.MustCompile(`^[\x{4e00}-\x{9fff}]{2}$`)
	reCJK3 = regexp.MustCompile(`^[\x{4e00}-\x{9fff}]{3}$`)
	// Node: /[a-zA-Z]{3,}/g
	reEnWord = regexp.MustCompile(`[a-zA-Z]{3,}`)
)

// KnowledgeBase 持有规则条目与关键词倒排索引。
//
// Node 版用 3 个模块级可变变量（knowledgeBase / keywordIndex / embeddingsReady）
// 保存状态；Go 侧改为结构体，由 main 构造一次后注入，避免包级全局。
type KnowledgeBase struct {
	mu      sync.RWMutex
	entries []Entry
	// 关键词 → 命中该词的条目下标集合（倒排索引）
	keywordIndex map[string]map[int]struct{}
	loaded       bool
}

// New 创建一个空的知识库（首次使用时惰性加载）。
func New() *KnowledgeBase {
	return &KnowledgeBase{keywordIndex: map[string]map[int]struct{}{}}
}

// Load 加载并解析内嵌的规则文档（幂等）。
func (kb *KnowledgeBase) Load() []Entry {
	kb.mu.Lock()
	defer kb.mu.Unlock()
	return kb.loadLocked()
}

func (kb *KnowledgeBase) loadLocked() []Entry {
	if kb.loaded {
		return kb.entries
	}
	kb.loaded = true

	jianpu, staff, mapping, err := LoadEmbeddedDocs()
	if err != nil {
		// 与 Node 版「目录不存在仅告警」的处理保持一致：不 panic，退化为空库
		return kb.entries
	}

	for _, f := range jianpu {
		kb.entries = append(kb.entries, parseRuleFile(f.Content)...)
	}
	for _, f := range staff {
		kb.entries = append(kb.entries, parseRuleFile(f.Content)...)
	}
	if mapping != "" {
		kb.entries = append(kb.entries, parseMappingFile(mapping)...)
	}

	kb.buildKeywordIndexLocked()
	return kb.entries
}

// Entries 返回全部规则条目。
func (kb *KnowledgeBase) Entries() []Entry { return kb.Load() }

// Len 返回规则条数。
func (kb *KnowledgeBase) Len() int { return len(kb.Load()) }

/* ── 解析 ── */

// parseRuleFile 解析 GB/T 标准 .md，提取章节标题与描述。
func parseRuleFile(text string) []Entry {
	entries := make([]Entry, 0)
	lines := strings.Split(text, "\n")

	for i := 0; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}
		m := reSection.FindStringSubmatch(line)
		if m == nil {
			continue
		}

		sectionID := m[1]
		// Node: m[2].replace(/^[A-Z][a-zA-Z\s]+$/, '').trim()
		title := strings.TrimSpace(reEnglishTitle.ReplaceAllString(m[2], ""))

		if len([]rune(title)) < 2 {
			continue
		}
		if reDigitsOnly.MatchString(title) {
			continue
		}

		// 收集后续描述（取接下来 10 行内的非空文本）
		descLines := make([]string, 0, 10)
		limit := i + 10
		if limit > len(lines) {
			limit = len(lines)
		}
		for j := i + 1; j < limit; j++ {
			nl := strings.TrimSpace(lines[j])
			if nl == "" || reDigitsOnly.MatchString(nl) || reCapitalizedWord.MatchString(nl) {
				continue
			}
			if reSection.MatchString(nl) {
				break
			}
			if strings.HasPrefix(nl, "GB/T") || strings.HasPrefix(nl, "示例") || strings.HasPrefix(nl, "注意") {
				break
			}
			// Node: nl.includes('\f') —— 换页符，不是空串
			if strings.Contains(nl, "\f") {
				continue
			}
			descLines = append(descLines, nl)
			if len([]rune(strings.Join(descLines, ""))) > 120 {
				break
			}
		}

		description := truncateRunes(strings.Join(descLines, ""), 200)
		if len([]rune(description)) < 10 {
			continue
		}

		entries = append(entries, Entry{
			SectionID:   sectionID,
			Title:       title,
			Description: description,
			Keywords:    extractKeywords(title + " " + description),
		})
	}

	return entries
}

// parseMappingFile 解析映射规范文档（提取 ### 级标题）。
func parseMappingFile(text string) []Entry {
	entries := make([]Entry, 0)
	lines := strings.Split(text, "\n")

	for i := 0; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		m := reH3.FindStringSubmatch(line)
		if m == nil {
			continue
		}

		title := m[1]
		descLines := make([]string, 0, 15)
		limit := i + 15
		if limit > len(lines) {
			limit = len(lines)
		}
		for j := i + 1; j < limit; j++ {
			nl := strings.TrimSpace(lines[j])
			if strings.HasPrefix(nl, "###") || strings.HasPrefix(nl, "##") {
				break
			}
			if nl == "" || strings.HasPrefix(nl, "|") {
				continue
			}
			descLines = append(descLines, nl)
		}

		description := truncateRunes(strings.Join(descLines, " "), 200)
		if len([]rune(description)) < 10 {
			continue
		}

		entries = append(entries, Entry{
			SectionID:   "MAP." + itoa(i),
			Title:       title,
			Description: description,
			Keywords:    extractKeywords(title + " " + description),
		})
	}

	return entries
}

// extractKeywords 提取中文 bigram/trigram + 英文单词。
//
// ⚠ 必须保持**插入顺序**（Node 用 Set 保序，最后 slice(0,30) 取前 30 个），
// 因此这里用 slice + 去重集合，而不是 Go 的 map（map 遍历无序）。
func extractKeywords(text string) []string {
	words := make([]string, 0, 64)
	seen := make(map[string]struct{})

	add := func(w string) {
		if _, ok := seen[w]; ok {
			return
		}
		seen[w] = struct{}{}
		words = append(words, w)
	}

	runes := []rune(text)
	for i := 0; i < len(runes); i++ {
		r := runes[i]
		if r < 0x4e00 || r > 0x9fff {
			continue
		}
		if i+1 < len(runes) {
			if bigram := string(runes[i : i+2]); reCJK2.MatchString(bigram) {
				add(bigram)
			}
		}
		if i+2 < len(runes) {
			if trigram := string(runes[i : i+3]); reCJK3.MatchString(trigram) {
				add(trigram)
			}
		}
	}

	for _, w := range reEnWord.FindAllString(text, -1) {
		add(strings.ToLower(w))
	}

	if len(words) > 30 {
		words = words[:30]
	}
	return words
}

// buildKeywordIndexLocked 构建「关键词 → 条目下标集合」的倒排索引。
func (kb *KnowledgeBase) buildKeywordIndexLocked() {
	kb.keywordIndex = make(map[string]map[int]struct{}, len(kb.keywordIndex))
	for ei, e := range kb.entries {
		for _, kw := range e.Keywords {
			set, ok := kb.keywordIndex[kw]
			if !ok {
				set = map[int]struct{}{}
				kb.keywordIndex[kw] = set
			}
			set[ei] = struct{}{}
		}
	}
}

/* ── 检索 ── */

// SearchKeyword 只用关键词加权匹配检索（向量路径不可用时的降级实现）。
//
// 计分规则与 Node 版完全一致：
//
//	命中条目关键词 +3；标题或描述包含 +1；标题包含再额外 +5
//
// ⚠ 用 sort.SliceStable：JS 的 Array.sort 是稳定的，Go 的 sort.Slice 不是，
// 并列分数下顺序漂移会让检索结果与 Node 版不一致。
func (kb *KnowledgeBase) SearchKeyword(input string, topK int) []Match {
	entries := kb.Load()
	if len(entries) == 0 {
		return []Match{}
	}

	inputKeywords := extractKeywords(input)
	if len(inputKeywords) == 0 {
		return []Match{}
	}

	type scored struct {
		idx     int
		score   int
		matched []string
	}
	scores := make([]scored, 0)

	for ei := range entries {
		entry := entries[ei]
		score := 0
		matched := make([]string, 0)

		for _, kw := range inputKeywords {
			if containsString(entry.Keywords, kw) {
				score += 3
				matched = append(matched, kw)
			} else if strings.Contains(entry.Title, kw) || strings.Contains(entry.Description, kw) {
				score += 1
			}
		}
		for _, kw := range inputKeywords {
			if strings.Contains(entry.Title, kw) {
				score += 5
			}
		}

		if score > 0 {
			scores = append(scores, scored{idx: ei, score: score, matched: matched})
		}
	}

	sort.SliceStable(scores, func(a, b int) bool { return scores[a].score > scores[b].score })

	if topK > len(scores) {
		topK = len(scores)
	}
	out := make([]Match, 0, topK)
	for _, s := range scores[:topK] {
		out = append(out, Match{Entry: entries[s.idx], Score: s.score, MatchedKeywords: s.matched})
	}
	return out
}

/* ── 小工具 ── */

func containsString(list []string, target string) bool {
	for _, s := range list {
		if s == target {
			return true
		}
	}
	return false
}

// truncateRunes 复刻 JS 的 slice(0, n)，按字符数截断而不是字节数。
func truncateRunes(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n])
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
