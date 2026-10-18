package rules

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/stretchr/testify/require"
)

type kbFixture struct {
	Count   int     `json:"count"`
	Entries []Entry `json:"entries"`
	Searches []struct {
		Query   string `json:"query"`
		Matches []struct {
			SectionID       string   `json:"sectionId"`
			Title           string   `json:"title"`
			Score           int      `json:"score"`
			MatchedKeywords []string `json:"matchedKeywords"`
		} `json:"matches"`
	} `json:"searches"`
}

func loadKBFixture(t *testing.T) kbFixture {
	t.Helper()
	path := filepath.Join("..", "..", "testdata", "knowledgebase_fixture.json")
	data, err := os.ReadFile(path)
	require.NoError(t, err, "读取知识库基准失败，请先运行 server/gen-kb-fixture.ts")

	var fx kbFixture
	require.NoError(t, json.Unmarshal(data, &fx))
	return fx
}

// TestKnowledgeBaseCount 迁移计划里明确的闸门：规则条数必须与 Node 版一致。
func TestKnowledgeBaseCount(t *testing.T) {
	fx := loadKBFixture(t)
	kb := New()

	require.Equal(t, fx.Count, kb.Len(), "知识库条目数与 Node 版不一致")
	t.Logf("✅ 知识库 %d 条，与 Node 版一致", kb.Len())
}

// TestKnowledgeBaseEntries 逐条比对全部条目（含关键词分词）。
func TestKnowledgeBaseEntries(t *testing.T) {
	fx := loadKBFixture(t)
	got := New().Entries()

	require.Len(t, got, len(fx.Entries))

	mismatch := 0
	for i := range fx.Entries {
		if !reflect.DeepEqual(fx.Entries[i], got[i]) {
			mismatch++
			if mismatch <= 5 {
				t.Errorf("条目 %d 不一致\nNode: %+v\nGo  : %+v", i, fx.Entries[i], got[i])
			}
		}
	}
	require.Zero(t, mismatch, "共 %d 条条目与 Node 版不一致", mismatch)
	t.Logf("✅ %d 条条目（含关键词分词）与 Node 版完全一致", len(got))
}

// TestSearchKeywordMatchesFixture 验证关键词降级路径的检索结果与排序。
func TestSearchKeywordMatchesFixture(t *testing.T) {
	fx := loadKBFixture(t)
	kb := New()

	passed := 0
	for _, sc := range fx.Searches {
		got := kb.SearchKeyword(sc.Query, 3)

		type matchView struct {
			SectionID       string   `json:"sectionId"`
			Title           string   `json:"title"`
			Score           int      `json:"score"`
			MatchedKeywords []string `json:"matchedKeywords"`
		}
		views := make([]matchView, 0, len(got))
		for _, m := range got {
			mk := m.MatchedKeywords
			if mk == nil {
				mk = []string{}
			}
			views = append(views, matchView{
				SectionID: m.Entry.SectionID, Title: m.Entry.Title,
				Score: m.Score, MatchedKeywords: mk,
			})
		}

		gotJSON, err := json.Marshal(views)
		require.NoError(t, err)
		var gotAny any
		require.NoError(t, json.Unmarshal(gotJSON, &gotAny))

		wantJSON, _ := json.Marshal(sc.Matches)
		var wantAny any
		require.NoError(t, json.Unmarshal(wantJSON, &wantAny))

		if !reflect.DeepEqual(wantAny, gotAny) {
			t.Errorf("检索 %q 结果不一致\nNode: %s\nGo  : %s", sc.Query, wantJSON, gotJSON)
			continue
		}
		passed++
	}
	t.Logf("✅ 关键词检索 %d/%d 条一致", passed, len(fx.Searches))
}
