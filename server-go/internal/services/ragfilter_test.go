package services

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"score-review/server-go/internal/rules"
)

// TestRagFilter 覆盖 Layer 2 的边界行为（对照 Node 版 ragFilter.test.ts）。
func TestRagFilter(t *testing.T) {
	kb := rules.New()
	require.Equal(t, 567, kb.Len(), "知识库应加载 567 条规则")

	t.Run("空内容被拒绝", func(t *testing.T) {
		got := RagFilter(kb, "   ")
		assert.False(t, got.Passed)
		assert.Equal(t, "内容为空", got.Reason)
	})

	t.Run("与记谱规范无关的内容被拒绝", func(t *testing.T) {
		// 用纯英文无意义串：中文内容容易与规则描述里的常用词（"内容""小节"等）
		// 产生二元组误匹配，反而过不了这条断言。
		got := RagFilter(kb, "qqqq zzzz wwww")
		assert.False(t, got.Passed)
		assert.Contains(t, got.Reason, "无关联")
	})

	t.Run("命中变音号规则时通过并带上下文", func(t *testing.T) {
		got := RagFilter(kb, "第 3 小节第 2 个音：变音号 # → b")
		assert.True(t, got.Passed)
		assert.NotEmpty(t, got.Context)
		assert.NotEmpty(t, got.MatchedRules)

		// 上下文格式：§章节号 标题：描述
		assert.Contains(t, got.Context, "§")
		assert.Contains(t, got.Context, "：")

		// 所有返回的命中项都应达到阈值
		for _, r := range got.MatchedRules {
			assert.GreaterOrEqual(t, r.Score, ragMinScore)
			assert.NotEmpty(t, r.SectionID)
			assert.NotEmpty(t, r.Title)
		}
	})

	t.Run("命中拍号/时值规则时通过", func(t *testing.T) {
		got := RagFilter(kb, "第 5 小节拍号 4/4，应含 4 拍，实际 5.0 拍（时值超出）")
		assert.True(t, got.Passed)
		assert.NotEmpty(t, got.MatchedRules)
	})
}
