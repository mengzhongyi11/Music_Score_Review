package notation

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/stretchr/testify/require"
)

// fixtureCase 对应 server/gen-notation-fixture.ts 的输出结构。
type fixtureCase struct {
	Input  string `json:"input"`
	Parsed any    `json:"parsed"`
}

// TestParseJianpuMatchesNodeFixture 是本次移植的关键闸门。
//
// testdata/notation_fixture.json 由 Node 版（权威实现）生成，覆盖解析器的
// 全部分支 + seed.sql 里的真实谱面。这里把 Go 版结果序列化后做语义比较
// （不比较键顺序，但**会比较键的有无**，因此能抓出 omitempty / null 的差异）。
func TestParseJianpuMatchesNodeFixture(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "testdata", "notation_fixture.json"))
	require.NoError(t, err, "读取基准数据失败，请先运行 server/gen-notation-fixture.ts")

	var cases []fixtureCase
	require.NoError(t, json.Unmarshal(data, &cases))
	require.NotEmpty(t, cases)

	passed := 0
	for i, c := range cases {
		got := ParseJianpu(&c.Input)

		raw, err := json.Marshal(got)
		require.NoError(t, err, "用例 %d 序列化失败", i)

		// 反序列化成 any 再比，忽略键顺序但保留键的有无
		var gotAny any
		require.NoError(t, json.Unmarshal(raw, &gotAny))

		if !reflect.DeepEqual(c.Parsed, gotAny) {
			t.Errorf("用例 %d 解析结果与 Node 版不一致\n输入: %q\nNode: %s\nGo  : %s",
				i, c.Input, mustJSON(c.Parsed), string(raw))
			if i > 0 && passed == 0 {
				t.Fatalf("首个用例即失败，后续跳过")
			}
			continue
		}
		passed++
	}

	t.Logf("✅ %d/%d 条用例与 Node 版完全一致", passed, len(cases))
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// TestParseJianpuBasic 不依赖基准数据的冒烟测试，便于快速定位问题。
func TestParseJianpuBasic(t *testing.T) {
	content := "1=C 4/4\n| 1 2 3 4 |"
	got := ParseJianpu(&content)

	require.Equal(t, "1=C", got.Key)
	require.Equal(t, "4/4", got.TimeSignature)
	require.Nil(t, got.Tempo)
	require.Equal(t, 4, got.TotalBeats)
	require.Equal(t, 4, got.BeatUnit)
	require.Len(t, got.Measures, 1)
	require.Len(t, got.Measures[0].Notes, 4)
	require.Equal(t, "1", got.Measures[0].Notes[0].Pitch)
	require.Equal(t, 4, got.Measures[0].Notes[0].Duration)
}

// TestEmptyContent 空内容返回默认结构。
func TestEmptyContent(t *testing.T) {
	got := ParseJianpu(nil)
	require.Equal(t, "1=C", got.Key)
	require.Equal(t, "4/4", got.TimeSignature)
	require.Empty(t, got.Measures)
	require.NotNil(t, got.Measures, "measures 必须是非 nil 空切片，否则 JSON 会输出 null")
}
