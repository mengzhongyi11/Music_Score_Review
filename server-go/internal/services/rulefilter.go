package services

import (
	"regexp"
	"strings"
)

// musicKeywords 与 server/src/services/ruleFilter.ts 的 MUSIC_KEYWORDS 逐项一致。
var musicKeywords = []string{
	"节奏", "音符", "和弦", "调号", "拍号", "力度", "速度", "旋律",
	"和声", "小节", "休止", "连音", "附点", "符干", "符头", "符尾",
	"音高", "音域", "音阶", "唱名", "高音", "低音", "中音",
	"全音", "半音", "变音", "升号", "降号", "还原", "调性",
	"大调", "小调", "转调", "移调", "临时", "终止", "反复",
	"跳越", "渐强", "渐弱", "渐慢", "渐快", "原速",
	"断音", "重音", "保持音", "延长", "琶音", "滑音", "颤音",
	"波音", "回音", "倚音", "震音", "和弦",
	"声部", "纵列", "对位", "复调", "主调",
	"cresc", "dim", "rit", "a tempo", "legato", "stacc",
	"力度标记", "表情记号", "速度标记", "演奏法",
	"小节线", "终止线", "段落线", "连谱号",
	"增时线", "减时线", "延音线", "圆滑线",
	"分句", "乐句", "乐段", "乐章",
	"1=", "4/4", "3/4", "2/4", "6/8", "3/8",
}

var meaninglessPatterns = []*regexp.Regexp{
	regexp.MustCompile(`^\d{1,3}$`),               // 纯数字 1-3 位
	regexp.MustCompile(`(?i)^(test|asdf|qwer)$`),  // 常见测试字符串（JS 用了 /i）
	regexp.MustCompile(`^(哈哈|呵呵|嗯|哦)$`),         // 语气词
}

// RuleFilterResult 规则层过滤结果。
type RuleFilterResult struct {
	Passed         bool
	Reason         string
	SuggestionType string
}

// RuleFilter 是 Layer 1 规则过滤（零成本），行为对齐 TS 版 ruleFilter。
func RuleFilter(input string) RuleFilterResult {
	if strings.TrimSpace(input) == "" {
		return RuleFilterResult{Passed: false, Reason: "内容为空", SuggestionType: "auto_reject"}
	}

	text := strings.TrimSpace(input)

	// 长度检查：JS 的 text.length 是 UTF-16 code unit 数，
	// 中文全是 BMP 字符（1 code unit），此处用 rune 数等价。
	if len([]rune(text)) < 5 {
		return RuleFilterResult{Passed: false, Reason: "内容过短（少于5个字），无意义的测试内容", SuggestionType: "auto_reject"}
	}

	for _, p := range meaninglessPatterns {
		if p.MatchString(text) {
			return RuleFilterResult{Passed: false, Reason: "匹配无意义模式，自动驳回", SuggestionType: "auto_reject"}
		}
	}

	for _, kw := range musicKeywords {
		if strings.Contains(text, kw) {
			return RuleFilterResult{Passed: true}
		}
	}
	return RuleFilterResult{Passed: false, Reason: "内容不包含任何音乐相关关键词，非专业术语", SuggestionType: "auto_reject"}
}

// GuessPriorityFromRule 按关键词猜测优先级。
//
// ⚠ 注意保留 TS 版的运算优先级：JS 中 && 优先级高于 ||，原表达式等价于
//   含错误 || 含冲突 || 含超 || (含节拍 && 含异常)
// 这里刻意用括号显式写出，避免被"顺手修正"成不同语义。
func GuessPriorityFromRule(text string) string {
	t := strings.ToLower(text)
	if strings.Contains(t, "错误") ||
		strings.Contains(t, "冲突") ||
		strings.Contains(t, "超") ||
		(strings.Contains(t, "节拍") && strings.Contains(t, "异常")) {
		return "P0"
	}
	if strings.Contains(t, "建议") || strings.Contains(t, "可以") ||
		strings.Contains(t, "优化") || strings.Contains(t, "调整") {
		return "P1"
	}
	return "P2"
}
