import { analyzeSectionImpact } from './impactAnalyzer';

describe('impactAnalyzer', () => {
  test('identical content has low risk', () => {
    const result = analyzeSectionImpact({
      sectionName: '第一乐章',
      mainContent: '1=C 4/4 ♩=120\n| 3 3 4 5 | 5 4 3 2 |',
      branchContent: '1=C 4/4 ♩=120\n| 3 3 4 5 | 5 4 3 2 |',
    });
    expect(result.overallRisk).toBe('low');
    expect(result.impacts).toHaveLength(0);
  });

  test('tempo change > 20 BPM flagged as high risk', () => {
    const result = analyzeSectionImpact({
      sectionName: '第二乐章',
      mainContent: '1=C 4/4 ♩=120\n| 3 3 4 5 |',
      branchContent: '1=C 4/4 ♩=96\n| 3 3 4 5 |',
    });
    const tempoImpact = result.impacts.find(i => i.type === 'tempo');
    expect(tempoImpact).toBeDefined();
    expect(tempoImpact!.severity).toBe('high');
  });

  test('tempo change 10-20 BPM flagged as medium risk', () => {
    const result = analyzeSectionImpact({
      sectionName: '第三乐章',
      mainContent: '1=C 4/4 ♩=120\n| 3 3 4 5 |',
      branchContent: '1=C 4/4 ♩=106\n| 3 3 4 5 |',
    });
    const tempoImpact = result.impacts.find(i => i.type === 'tempo');
    expect(tempoImpact).toBeDefined();
    expect(tempoImpact!.severity).toBe('medium');
  });

  test('key signature change flagged as high risk', () => {
    const result = analyzeSectionImpact({
      sectionName: '第四乐章',
      mainContent: '1=C 4/4\n| 3 3 4 5 |',
      branchContent: '1=G 4/4\n| 3 3 4 5 |',
    });
    const keyImpact = result.impacts.find(i => i.type === 'key');
    expect(keyImpact).toBeDefined();
    expect(keyImpact!.severity).toBe('high');
  });

  test('time signature change flagged as high risk', () => {
    const result = analyzeSectionImpact({
      sectionName: '第五乐章',
      mainContent: '1=C 4/4\n| 3 3 4 5 |',
      branchContent: '1=C 3/4\n| 3 3 4 |',
    });
    const timeImpact = result.impacts.find(i => i.type === 'structure');
    expect(timeImpact).toBeDefined();
    expect(timeImpact!.severity).toBe('high');
  });

  test('content length change > 50% flagged', () => {
    const result = analyzeSectionImpact({
      sectionName: '第六乐章',
      mainContent: '1=C 4/4\n| 3 3 4 5 |',
      branchContent: '1=C 4/4\n| 3 3 4 5 | 5 4 3 2 | 1 1 2 3 |',
    });
    const structImpact = result.impacts.find(i => i.type === 'structure');
    expect(structImpact).toBeDefined();
    expect(structImpact!.severity).toBe('high');
  });

  test('overall risk is high when multiple high-risk impacts exist', () => {
    const result = analyzeSectionImpact({
      sectionName: '第七乐章',
      mainContent: '1=C 4/4 ♩=120\n| 3 3 4 5 |',
      branchContent: '1=G 3/4 ♩=96\n| 3 3 5 5 |',
    });
    expect(result.overallRisk).toBe('high');
    expect(result.impacts.length).toBeGreaterThanOrEqual(3);
  });

  test('returns affected sections info', () => {
    const result = analyzeSectionImpact({
      sectionName: '第一乐章',
      mainContent: '1=C 4/4\n| 3 3 4 5 |',
      branchContent: '1=C 4/4\n| 3 3 5 5 |',
    });
    expect(result.sectionId).toBeDefined();
    expect(result.sectionName).toBe('第一乐章');
  });
});
