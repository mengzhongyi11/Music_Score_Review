package services

import (
	"context"
	"testing"

	_ "github.com/go-sql-driver/mysql" // 注册 driver（services 包不经过 internal/database）
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"score-review/server-go/internal/rules"
)

// TestAIReviewPipeline 验证三层过滤流水线的短路逻辑。
//
// 这三条用例都不需要数据库，也不需要真实的 LLM：
//   - 规则层能拦住的内容，不会走到 RAG 与 AI
//   - RAG 层能拦住的内容，不会走到 AI
//   - 前两层都通过时，进入 AI 层；未配置 API Key 时会稳定降级为 discuss + P2
//
// 注意：Layer 0（偏好预判）需要数据库，这里用一个指向不可达地址的 DB 句柄，
// 查询失败会被 AnalyzeSubmission 内部吞掉并继续往下走（与 Node 的 try/catch 一致）。
func TestAIReviewPipeline(t *testing.T) {
	// 指向不可达地址：Layer 0 的偏好查询会失败并被忽略，不影响后续层级
	db, err := sqlx.Open("mysql", "root@tcp(127.0.0.1:1)/none")
	require.NoError(t, err)
	defer db.Close()

	kb := rules.New()

	t.Run("规则层拦截无音乐关键词的内容", func(t *testing.T) {
		client := NewDashScopeClient("") // 无 key：不应被调用
		svc := NewAIReviewService(db, kb, client)

		got := svc.AnalyzeSubmission(context.Background(), AnalyzeInput{
			ScoreID: 1, Content: "这是一段完全无关的闲聊内容",
		})

		assert.False(t, got.Passed)
		assert.Equal(t, "rule", got.Layer)
		assert.Equal(t, "auto_reject", got.SuggestionType)
		assert.Equal(t, "P2", got.Priority)
	})

	t.Run("规则层拦截过短内容", func(t *testing.T) {
		svc := NewAIReviewService(db, kb, NewDashScopeClient(""))

		got := svc.AnalyzeSubmission(context.Background(), AnalyzeInput{
			ScoreID: 1, Content: "123",
		})

		assert.False(t, got.Passed)
		assert.Equal(t, "rule", got.Layer)
		assert.Contains(t, got.Reason, "过短")
	})

	t.Run("规则层拦截无意义模式", func(t *testing.T) {
		svc := NewAIReviewService(db, kb, NewDashScopeClient(""))

		got := svc.AnalyzeSubmission(context.Background(), AnalyzeInput{
			ScoreID: 1, Content: "test",
		})

		assert.False(t, got.Passed)
		assert.Equal(t, "rule", got.Layer)
		assert.Contains(t, got.Reason, "无意义")
	})

	t.Run("RAG 层拦截与记谱规范无关的内容", func(t *testing.T) {
		svc := NewAIReviewService(db, kb, NewDashScopeClient(""))

		// 含音乐关键词（能过规则层），但与 GB/T 条款无关（应被 RAG 拦住）
		got := svc.AnalyzeSubmission(context.Background(), AnalyzeInput{
			ScoreID: 1, Content: "今天的旋律让我想起了很多美好的回忆",
		})

		assert.False(t, got.Passed)
		assert.Equal(t, "rag", got.Layer)
		assert.Equal(t, "auto_reject", got.SuggestionType)
	})

	t.Run("前两层通过后进入 AI 层，无 key 时降级为 discuss+P2", func(t *testing.T) {
		svc := NewAIReviewService(db, kb, NewDashScopeClient(""))

		// 命中"变音号"规则，能过 RAG 层
		got := svc.AnalyzeSubmission(context.Background(), AnalyzeInput{
			ScoreID: 1, Content: "第 3 小节第 2 个音的变音号写错了，应该是 #4",
		})

		assert.True(t, got.Passed)
		assert.Equal(t, "ai", got.Layer)
		// LLM 不可用 → 降级（ReviewWithFallback 内部兜底，不会报错）
		assert.Equal(t, "discuss", got.SuggestionType)
		assert.Equal(t, "P2", got.Priority)
		assert.NotEmpty(t, got.Reason)
		// 必须把 RAG 上下文带下去，供人工参考
		require.NotNil(t, got.RagContext)
		assert.NotEmpty(t, *got.RagContext)
	})
}

// TestDashScopeClientNoKey 验证未配置 key 时的行为。
func TestDashScopeClientNoKey(t *testing.T) {
	client := NewDashScopeClient("")
	assert.False(t, client.HasKey())

	_, err := client.ReviewAnalyze(context.Background(), "内容", "")
	assert.Error(t, err)

	// 合并建议在无 key 时直接返回 nil（不阻塞合并流程）
	assert.Nil(t, client.GenerateMergeSuggestion(context.Background(), nil, MergeParams{
		ConflictDetail: "测试", MainValue: "1", BranchValue: "2",
	}))

	// 降级结果必须是 discuss + P2
	got := client.ReviewWithFallback(context.Background(), "内容", "")
	assert.Equal(t, "discuss", got.SuggestionType)
	assert.Equal(t, "P2", got.Priority)
	assert.Contains(t, got.Reason, "已降级为人工讨论")
}

// TestParsePatterns 兼容 preference_value 的两种存储形态。
func TestParsePatterns(t *testing.T) {
	t.Run("直接是数组", func(t *testing.T) {
		assert.Equal(t, []string{"a", "b"}, parsePatterns([]byte(`["a","b"]`)))
	})
	t.Run("是 JSON 字符串包裹的数组", func(t *testing.T) {
		assert.Equal(t, []string{"a", "b"}, parsePatterns([]byte(`"[\"a\",\"b\"]"`)))
	})
	t.Run("非法内容返回空", func(t *testing.T) {
		assert.Empty(t, parsePatterns([]byte(`123`)))
	})
}
