package services

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/stretchr/testify/require"
)

// fixtureDir 指向由 server/gen-fixtures.ts 生成的基准数据。
func fixtureDir() string { return filepath.Join("..", "..", "testdata") }

// toAny 把结构体转成 any，用于与 Node 基准做忽略键顺序、但保留键有无的语义比较。
func toAny(t *testing.T, v any) any {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	var out any
	require.NoError(t, json.Unmarshal(raw, &out))
	return out
}

func loadFixture(t *testing.T, name string, dst any) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(fixtureDir(), name))
	require.NoError(t, err, "读取基准数据失败，请先运行 server/gen-fixtures.ts")
	require.NoError(t, json.Unmarshal(data, dst))
}

/* ══════════ 规则过滤 ══════════ */

func TestRuleFilterMatchesFixture(t *testing.T) {
	var cases []struct {
		Input    string          `json:"input"`
		Result   any             `json:"result"`
		Priority string          `json:"priority"`
	}
	loadFixture(t, "rule_filter_fixture.json", &cases)
	require.NotEmpty(t, cases)

	passed := 0
	for i, c := range cases {
		got := RuleFilter(c.Input)
		// 对齐 TS 的可选字段语义：reason/suggestionType 为空时**键不存在**。
		// 注意不能写成 map 里放 nil——那会序列化成 "reason":null，键仍然存在。
		shaped := map[string]any{"passed": got.Passed}
		if got.Reason != "" {
			shaped["reason"] = got.Reason
		}
		if got.SuggestionType != "" {
			shaped["suggestionType"] = got.SuggestionType
		}
		gotJSON, err := json.Marshal(shaped)
		require.NoError(t, err)
		var gotAny any
		require.NoError(t, json.Unmarshal(gotJSON, &gotAny))

		if !reflect.DeepEqual(c.Result, gotAny) {
			t.Errorf("用例 %d ruleFilter 不一致\n输入: %q\nNode: %s\nGo  : %s", i, c.Input, mustJSON(c.Result), string(gotJSON))
			continue
		}
		if p := GuessPriorityFromRule(c.Input); p != c.Priority {
			t.Errorf("用例 %d guessPriorityFromRule 不一致\n输入: %q Node=%s Go=%s", i, c.Input, c.Priority, p)
			continue
		}
		passed++
	}
	t.Logf("✅ ruleFilter %d/%d 条一致", passed, len(cases))
}

/* ══════════ 偏好学习 ══════════ */

func TestPreferenceMatchesFixture(t *testing.T) {
	var fx struct {
		Features []struct {
			Input    string   `json:"input"`
			Features []string `json:"features"`
		} `json:"features"`
		Reject []struct {
			Content  string   `json:"content"`
			Patterns []string `json:"patterns"`
			Result   bool     `json:"result"`
		} `json:"reject"`
		Stats []struct {
			Input struct {
				Total         int  `json:"total"`
				Accepted      int  `json:"accepted"`
				Rejected      int  `json:"rejected"`
				Dismissed     int  `json:"dismissed"`
				AISuggestions *int `json:"aiSuggestions"`
				AIAccepted    *int `json:"aiAccepted"`
				CommonErrors  []struct {
					Type  string `json:"type"`
					Count int    `json:"count"`
				} `json:"commonErrors"`
			} `json:"input"`
			Result any `json:"result"`
		} `json:"stats"`
	}
	loadFixture(t, "preference_fixture.json", &fx)

	// features
	ok := 0
	for i, c := range fx.Features {
		got := ExtractFeatures(c.Input)
		if !reflect.DeepEqual(c.Features, got) {
			t.Errorf("features 用例 %d 不一致\n输入: %q\nNode: %v\nGo  : %v", i, c.Input, c.Features, got)
			continue
		}
		ok++
	}
	t.Logf("✅ extractFeatures %d/%d 条一致", ok, len(fx.Features))

	// reject
	ok = 0
	for i, c := range fx.Reject {
		got := ShouldAutoReject(c.Content, c.Patterns)
		if got != c.Result {
			t.Errorf("reject 用例 %d 不一致\n输入: %q patterns=%v Node=%v Go=%v", i, c.Content, c.Patterns, c.Result, got)
			continue
		}
		ok++
	}
	t.Logf("✅ shouldAutoReject %d/%d 条一致", ok, len(fx.Reject))

	// stats
	ok = 0
	for i, c := range fx.Stats {
		in := StatsInput{
			Total: c.Input.Total, Accepted: c.Input.Accepted,
			Rejected: c.Input.Rejected, Dismissed: c.Input.Dismissed,
		}
		if c.Input.AISuggestions != nil {
			in.AISuggestions = *c.Input.AISuggestions
		}
		if c.Input.AIAccepted != nil {
			in.AIAccepted = *c.Input.AIAccepted
		}
		for _, e := range c.Input.CommonErrors {
			in.CommonErrors = append(in.CommonErrors, CommonError{Type: e.Type, Count: e.Count})
		}

		gotAny := toAny(t, CalculateStats(in))
		if !reflect.DeepEqual(c.Result, gotAny) {
			t.Errorf("stats 用例 %d 不一致\nNode: %s\nGo  : %s", i, mustJSON(c.Result), mustJSON(gotAny))
			continue
		}
		ok++
	}
	t.Logf("✅ calculateStats %d/%d 条一致", ok, len(fx.Stats))
}

/* ══════════ 冲突检测 + 影响分析 ══════════ */

func TestDiffMatchesFixture(t *testing.T) {
	var cases []struct {
		Main      string `json:"main"`
		Branch    string `json:"branch"`
		Conflicts any    `json:"conflicts"`
		Impact    any    `json:"impact"`
	}
	loadFixture(t, "diff_fixture.json", &cases)
	require.NotEmpty(t, cases)

	conflictOK, impactOK := 0, 0
	for i, c := range cases {
		main, branch := c.Main, c.Branch

		gotConflicts := toAny(t, DetectConflicts(DiffInput{
			MainContent: &main, BranchContent: &branch,
		}))
		if reflect.DeepEqual(c.Conflicts, gotConflicts) {
			conflictOK++
		} else {
			t.Errorf("冲突 用例 %d 不一致\nmain=%q\nbranch=%q\nNode: %s\nGo  : %s",
				i, c.Main, c.Branch, mustJSON(c.Conflicts), mustJSON(gotConflicts))
		}

		gotImpact := toAny(t, AnalyzeSectionImpact(ImpactInput{
			SectionName: "测试乐段", MainContent: &main, BranchContent: &branch,
		}))
		if reflect.DeepEqual(c.Impact, gotImpact) {
			impactOK++
		} else {
			t.Errorf("影响 用例 %d 不一致\nmain=%q\nbranch=%q\nNode: %s\nGo  : %s",
				i, c.Main, c.Branch, mustJSON(c.Impact), mustJSON(gotImpact))
		}
	}
	t.Logf("✅ detectConflicts %d/%d、analyzeSectionImpact %d/%d 条一致",
		conflictOK, len(cases), impactOK, len(cases))
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
