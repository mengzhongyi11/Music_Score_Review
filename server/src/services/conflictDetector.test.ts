import { detectConflicts } from './conflictDetector';

describe('conflictDetector', () => {
  // 无冲突：前后内容一致
  test('identical content returns no conflicts', () => {
    const content = '1=C 4/4\n| 3 3 4 5 | 5 4 3 2 |';
    const result = detectConflicts({ mainContent: content, branchContent: content });
    expect(result.conflicts).toHaveLength(0);
    expect(result.hasConflict).toBe(false);
  });

  // 单音高变更
  test('single pitch change detected', () => {
    const main = '1=C 4/4\n| 3 3 4 5 |';
    const branch = '1=C 4/4\n| 3 3 5 5 |';
    const result = detectConflicts({ mainContent: main, branchContent: branch });
    expect(result.hasConflict).toBe(true);
    const noteConflicts = result.conflicts.filter(c => c.type === 'note_content');
    expect(noteConflicts.length).toBeGreaterThanOrEqual(1);
    expect(noteConflicts[0].mainValue).toContain('4');
    expect(noteConflicts[0].branchValue).toContain('5');
  });

  // 速度冲突（必须在头部行）
  test('tempo change detected', () => {
    const main = '1=C 4/4 ♩=120\n| 3 3 4 5 |';
    const branch = '1=C 4/4 ♩=108\n| 3 3 4 5 |';
    const result = detectConflicts({
      mainContent: main,
      branchContent: branch,
    });
    const tempoConflicts = result.conflicts.filter(c => c.type === 'tempo');
    expect(tempoConflicts.length).toBe(1);
    expect(tempoConflicts[0].mainValue).toContain('120');
    expect(tempoConflicts[0].branchValue).toContain('108');
  });

  // 调号冲突
  test('key signature change detected', () => {
    const notes = '| 3 3 4 5 |';
    const result = detectConflicts({
      mainContent: '1=C 4/4\n' + notes,
      branchContent: '1=G 4/4\n' + notes,
    });
    const keyConflicts = result.conflicts.filter(c => c.type === 'key_signature');
    expect(keyConflicts.length).toBe(1);
    expect(keyConflicts[0].mainValue).toBe('1=C');
    expect(keyConflicts[0].branchValue).toBe('1=G');
  });

  // 八度差异
  test('octave difference detected', () => {
    const main = '1=C 4/4\n| 3 3 4 5 |';
    const branch = '1=C 4/4\n| 3 ˙3 4 5 |'; // 高八度 3
    const result = detectConflicts({ mainContent: main, branchContent: branch });
    expect(result.hasConflict).toBe(true);
    expect(result.conflicts.some(c => c.description.includes('八度'))).toBe(true);
  });

  // 多冲突汇总：调号+速度+音高同时变化
  test('multiple conflicts reported together', () => {
    const main = '1=C 4/4 ♩=120\n| 3 3 4 5 | 5 4 3 2 |';
    const branch = '1=G 4/4 ♩=108\n| 3 3 5 5 | 5 4 3 2 |';
    const result = detectConflicts({ mainContent: main, branchContent: branch });
    expect(result.conflicts.length).toBeGreaterThanOrEqual(3);
    expect(result.summary).toBeDefined();
  });

  // 空内容无冲突
  test('empty content returns no conflicts', () => {
    const result = detectConflicts({ mainContent: '', branchContent: '' });
    expect(result.hasConflict).toBe(false);
    expect(result.conflicts).toHaveLength(0);
  });
});

