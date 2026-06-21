import { ragFilter, ragFilterTest } from './ragFilter';

describe('ragFilter — GB/T 规则知识库匹配', () => {
  // 匹配规则相关内容
  test('matches content related to dynamics notation', async () => {
    const result = await ragFilter('第5小节力度从 f 改为 mf，与前后力度变化更协调');
    expect(result.passed).toBe(true);
    expect(result.context).toBeDefined();
    expect(result.context).toContain('力度');
  });

  test('matches content related to note values / duration', async () => {
    const result = await ragFilter('第3小节第2拍的音符时值有误，应为八分音符');
    expect(result.passed).toBe(true);
    expect(result.context).toBeDefined();
  });

  test('matches content related to ties / slurs', async () => {
    const result = await ragFilter('第8小节和9小节的连音线没有连接正确');
    expect(result.passed).toBe(true);
    expect(result.context).toBeDefined();
  });

  test('matches content related to key signature', async () => {
    const result = await ragFilter('这个乐段的调号应该从 1=C 改成 1=G');
    expect(result.passed).toBe(true);
    expect(result.context).toBeDefined();
  });

  test('matches content related to accidentals', async () => {
    const result = await ragFilter('第6小节的变音号遗漏了还原号');
    expect(result.passed).toBe(true);
    expect(result.context).toBeDefined();
  });

  // 不匹配规则无关内容
  test('rejects content unrelated to music notation', async () => {
    const result = await ragFilter('今天天气真好');
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('无关联');
  });

  test('rejects non-musical placeholder text', async () => {
    const result = await ragFilter('测试test测');
    expect(result.passed).toBe(false);
  });

  // ragFilterTest 返回匹配详情
  test('returns match details in test mode', async () => {
    const result = await ragFilterTest('音符时值错误');
    expect(result.passed).toBe(true);
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].sectionId).toBeDefined();
    expect(result.matches[0].title).toBeDefined();
  });
});
