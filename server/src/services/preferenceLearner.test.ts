import { calculateStats, shouldAutoReject } from './preferenceLearner';

describe('preferenceLearner', () => {
  // 统计计算
  test('calculates acceptance rate correctly', () => {
    const stats = calculateStats({
      total: 10,
      accepted: 6,
      rejected: 3,
      dismissed: 1,
    });
    expect(stats.acceptanceRate).toBe(0.6); // 6/10
    expect(stats.totalProcessed).toBe(10);
  });

  test('handles zero total', () => {
    const stats = calculateStats({
      total: 0, accepted: 0, rejected: 0, dismissed: 0,
    });
    expect(stats.acceptanceRate).toBe(0);
    expect(stats.totalProcessed).toBe(0);
  });

  test('calculates AI accuracy', () => {
    const stats = calculateStats({
      total: 10,
      accepted: 7,
      rejected: 2,
      dismissed: 1,
      aiSuggestions: 5,
      aiAccepted: 4,
    });
    expect(stats.aiAccuracy).toBe(0.8); // 4/5
  });

  test('handles zero AI suggestions', () => {
    const stats = calculateStats({
      total: 5, accepted: 3, rejected: 1, dismissed: 1,
      aiSuggestions: 0, aiAccepted: 0,
    });
    expect(stats.aiAccuracy).toBe(0);
  });

  // 驳回模式匹配（子串匹配）
  test('shouldAutoReject matches rejected patterns', () => {
    const patterns = ['速度', '调号', '删除力度'];
    expect(shouldAutoReject('建议将速度改为 180', patterns)).toBe(true);
    expect(shouldAutoReject('将调号从 C 改为 G', patterns)).toBe(true);
  });

  test('shouldAutoReject returns false for unrelated content', () => {
    const patterns = ['速度', '调号'];
    expect(shouldAutoReject('建议增加渐强标记', patterns)).toBe(false);
    expect(shouldAutoReject('第 5 小节力度调整', patterns)).toBe(false);
  });

  test('shouldAutoReject matches partial content', () => {
    const patterns = ['速度', '调号'];
    expect(shouldAutoReject('速度调整到 120', patterns)).toBe(true);
    expect(shouldAutoReject('修改调号到 G', patterns)).toBe(true);
  });

  test('shouldAutoReject works with empty patterns', () => {
    expect(shouldAutoReject('任何内容', [])).toBe(false);
  });
});
