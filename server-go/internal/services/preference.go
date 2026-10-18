package services

import (
	"regexp"
	"strings"
)

// StatsInput 统计输入。
type StatsInput struct {
	Total         int
	Accepted      int
	Rejected      int
	Dismissed     int
	AISuggestions int
	AIAccepted    int
	CommonErrors  []CommonError
}

// CommonError 常见错误项。
type CommonError struct {
	Type  string `json:"type"`
	Count int    `json:"count"`
}

// ReviewStats 统计结果。
type ReviewStats struct {
	TotalProcessed int           `json:"totalProcessed"`
	AcceptanceRate float64       `json:"acceptanceRate"`
	RejectionRate  float64       `json:"rejectionRate"`
	AIAccuracy     float64       `json:"aiAccuracy"`
	CommonErrors   []CommonError `json:"commonErrors"`
}

// CalculateStats 计算审阅统计，行为对齐 TS 版 calculateStats。
func CalculateStats(input StatsInput) ReviewStats {
	commonErrors := input.CommonErrors
	if commonErrors == nil {
		commonErrors = []CommonError{} // TS 里缺省是 []，不能输出 null
	}

	acceptance, rejection, accuracy := 0.0, 0.0, 0.0
	if input.Total > 0 {
		acceptance = float64(input.Accepted) / float64(input.Total)
		rejection = float64(input.Rejected) / float64(input.Total)
	}
	if input.AISuggestions > 0 {
		accuracy = float64(input.AIAccepted) / float64(input.AISuggestions)
	}

	return ReviewStats{
		TotalProcessed: input.Total,
		AcceptanceRate: acceptance,
		RejectionRate:  rejection,
		AIAccuracy:     accuracy,
		CommonErrors:   commonErrors,
	}
}

// ShouldAutoReject 判断内容是否命中用户已驳回的模式。
func ShouldAutoReject(content string, rejectedPatterns []string) bool {
	if len(rejectedPatterns) == 0 {
		return false
	}
	for _, p := range rejectedPatterns {
		if strings.Contains(content, p) {
			return true
		}
	}
	return false
}

var (
	reFeatDynamic = regexp.MustCompile(`力度|f\b|p\b|mf|mp|ff|pp|cresc|dim`)
	reFeatTempo   = regexp.MustCompile(`速度|♩=|tempo|BPM|bpm`)
	reFeatKey     = regexp.MustCompile(`调号|1=`)
	reFeatMeter   = regexp.MustCompile(`拍号|\d/\d`)
	reFeatPitch   = regexp.MustCompile(`音高|音符|音|小节.*\d`)
)

// ExtractFeatures 提取用于偏好匹配的关键特征，顺序与 TS 版一致。
func ExtractFeatures(content string) []string {
	features := make([]string, 0, 5)

	if reFeatDynamic.MatchString(content) {
		features = append(features, "力度")
	}
	if reFeatTempo.MatchString(content) {
		features = append(features, "速度")
	}
	if reFeatKey.MatchString(content) {
		features = append(features, "调号")
	}
	// 注意括号：TS 是 (拍号 || \d/\d) && !含'1='
	if reFeatMeter.MatchString(content) && !strings.Contains(content, "1=") {
		features = append(features, "拍号")
	}
	if reFeatPitch.MatchString(content) {
		features = append(features, "音高")
	}

	return features
}
