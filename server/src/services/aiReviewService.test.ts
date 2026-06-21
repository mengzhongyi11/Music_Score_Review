/**
 * AI 三层过滤流水线 — 集成测试
 * 规则层 + RAG 规则库 + AI/LLM（mock）
 */
import { ruleFilter } from './ruleFilter';
import { ragFilter } from './ragFilter';
import { analyzeSubmission } from './aiReviewService';

// Mock DashScope（Layer 3）
jest.mock('./dashScopeProvider', () => ({
  aiReviewWithFallback: jest.fn().mockResolvedValue({
    suggestionType: 'discuss',
    priority: 'P1',
    title: 'AI 分析',
    reason: '这是一条合理的力度修改建议',
  }),
}));

describe('三层过滤流水线', () => {
  // ── 完整链路：通过三层 → 返回 AI 结果 ──
  test('有意义的音乐内容通过三层过滤返回 AI 结果', async () => {
    const result = await analyzeSubmission({
      scoreId: 1,
      content: '第5小节力度从 f 改为 mf，与前后力度变化更协调',
      title: '力度修改',
      userId: 1,
    });
    expect(result.passed).toBe(true);
    expect(result.layer).toBe('ai');
    expect(result.suggestionType).toBe('discuss');
    expect(result.priority).toBe('P1');
  });

  // ── Layer 1 拦截：无意义内容 ──
  test('规则层拦截无意义内容', async () => {
    const ruleResult = ruleFilter('111');
    expect(ruleResult.passed).toBe(false);
    expect(ruleResult.suggestionType).toBe('auto_reject');
  });

  test('规则层拦截非音乐内容', async () => {
    const ruleResult = ruleFilter('今天天气真好');
    expect(ruleResult.passed).toBe(false);
  });

  test('规则层通过正常音乐内容', async () => {
    const ruleResult = ruleFilter('第5小节力度从 f 改为 mf');
    expect(ruleResult.passed).toBe(true);
  });

  // ── Layer 2 拦截 ──
  test('RAG 规则库拦截无关联内容', async () => {
    const ragResult = await ragFilter('今天我去超市买了些水果');
    expect(ragResult.passed).toBe(false);
    expect(ragResult.reason).toContain('无关联');
  });

  test('RAG 规则库匹配力度相关规范', async () => {
    const ragResult = await ragFilter('第5小节力度从 f 改为 mf');
    expect(ragResult.passed).toBe(true);
    expect(ragResult.context).toBeDefined();
    expect(ragResult.matchedRules).toBeDefined();
    expect(ragResult.matchedRules!.length).toBeGreaterThan(0);
  });

  test('RAG 规则库匹配变音号相关规范', async () => {
    const ragResult = await ragFilter('第6小节的变音号遗漏了还原号');
    expect(ragResult.passed).toBe(true);
    expect(ragResult.matchedRules!.length).toBeGreaterThan(0);
  });

  // ── 边界情况 ──
  test('空内容被规则层拦截', async () => {
    const result = await analyzeSubmission({
      scoreId: 1,
      content: '',
      userId: 1,
    });
    expect(result.passed).toBe(false);
    expect(result.layer).toBe('rule');
  });
});
