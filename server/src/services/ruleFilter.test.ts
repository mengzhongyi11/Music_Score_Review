import { ruleFilter } from './ruleFilter';

describe('ruleFilter', () => {
  // 应该拦截无意义内容
  test('rejects meaningless short input "111"', () => {
    const result = ruleFilter('111');
    expect(result.passed).toBe(false);
    expect(result.suggestionType).toBe('auto_reject');
  });

  test('rejects non-musical input "今天天气真好"', () => {
    const result = ruleFilter('今天天气真好');
    expect(result.passed).toBe(false);
    expect(result.suggestionType).toBe('auto_reject');
  });

  test('rejects empty input', () => {
    const result = ruleFilter('');
    expect(result.passed).toBe(false);
  });

  test('rejects test pattern "test"', () => {
    const result = ruleFilter('test');
    expect(result.passed).toBe(false);
  });

  // 应该通过有意义的音乐内容
  test('passes valid musical suggestion about dynamics', () => {
    const result = ruleFilter('第5小节力度从 f 改为 mf，与前后力度变化更协调');
    expect(result.passed).toBe(true);
  });

  test('passes valid musical suggestion about tempo', () => {
    const result = ruleFilter('建议将第一乐章速度调整为 ♩=108，更符合作品风格');
    expect(result.passed).toBe(true);
  });

  test('passes content with jianpu notation', () => {
    const result = ruleFilter('1=C 4/4| 3 3 4 5 | 小节内节拍数异常');
    expect(result.passed).toBe(true);
  });
});
