/**
 * 冲突检测引擎
 * 对比 main 和 branch 的简谱内容，检测音符级差异
 */
import { parseJianpu } from '../utils/notation';

export interface ConflictItem {
  type: 'note_content' | 'tempo' | 'key_signature' | 'time_signature' | 'structural' | 'metadata';
  measureIndex?: number;
  noteIndex?: number;
  field?: string;
  mainValue: string;
  branchValue: string;
  description: string;
}

export interface ConflictResult {
  hasConflict: boolean;
  conflicts: ConflictItem[];
  summary: string;
}

export interface DiffInput {
  mainContent: string;
  branchContent: string;
  mainTempo?: string | null;
  branchTempo?: string | null;
  mainKey?: string | null;
  branchKey?: string | null;
  mainTime?: string | null;
  branchTime?: string | null;
}

export function detectConflicts(input: DiffInput): ConflictResult {
  const conflicts: ConflictItem[] = [];

  // 1) 解析内容
  const mainParsed = parseJianpu(input.mainContent);
  const branchParsed = parseJianpu(input.branchContent);

  // 2) 头部对比（调号/拍号/速度）
  if (mainParsed.key !== branchParsed.key) {
    conflicts.push({
      type: 'key_signature',
      mainValue: mainParsed.key,
      branchValue: branchParsed.key,
      description: `调号变更：${mainParsed.key} → ${branchParsed.key}`,
    });
  }

  if (mainParsed.timeSignature !== branchParsed.timeSignature) {
    conflicts.push({
      type: 'time_signature',
      mainValue: mainParsed.timeSignature,
      branchValue: branchParsed.timeSignature,
      description: `拍号变更：${mainParsed.timeSignature} → ${branchParsed.timeSignature}`,
    });
  }

  // 速度比对（来自 parseJianpu 或外部传入）
  const mainTempo = input.mainTempo || mainParsed.tempo || '';
  const branchTempo = input.branchTempo || branchParsed.tempo || '';
  if (mainTempo && branchTempo && mainTempo !== branchTempo) {
    conflicts.push({
      type: 'tempo',
      mainValue: mainTempo,
      branchValue: branchTempo,
      description: `速度变更：${mainTempo} → ${branchTempo}`,
    });
  }

  // 3) 逐小节对比
  const maxMeasures = Math.max(mainParsed.measures.length, branchParsed.measures.length);
  for (let mi = 0; mi < maxMeasures; mi++) {
    const mNotes = mainParsed.measures[mi]?.notes?.filter(n => !n.isExtension) || [];
    const bNotes = branchParsed.measures[mi]?.notes?.filter(n => !n.isExtension) || [];
    const maxNotes = Math.max(mNotes.length, bNotes.length);

    for (let ni = 0; ni < maxNotes; ni++) {
      const mn = mNotes[ni];
      const bn = bNotes[ni];

      if (!mn || !bn) {
        // 音符数量不一致
        conflicts.push({
          type: 'note_content',
          measureIndex: mi + 1,
          noteIndex: ni + 1,
          mainValue: mn ? mn.raw : '(无)',
          branchValue: bn ? bn.raw : '(无)',
          description: `第 ${mi + 1} 小节第 ${ni + 1} 个音：${mn ? mn.raw : '无'} → ${bn ? bn.raw : '无'}（音符数量变更）`,
        });
        continue;
      }

      if (mn.pitch !== bn.pitch) {
        conflicts.push({
          type: 'note_content',
          measureIndex: mi + 1,
          noteIndex: ni + 1,
          mainValue: mn.raw,
          branchValue: bn.raw,
          description: `第 ${mi + 1} 小节第 ${ni + 1} 个音：音高 ${mn.pitch} → ${bn.pitch}`,
        });
      }
      if (mn.octaveDots !== bn.octaveDots) {
        conflicts.push({
          type: 'note_content',
          measureIndex: mi + 1,
          noteIndex: ni + 1,
          mainValue: mn.raw,
          branchValue: bn.raw,
          description: `第 ${mi + 1} 小节第 ${ni + 1} 个音：八度变更（高音点 ${mn.octaveDots} → ${bn.octaveDots}）`,
        });
      }
      if (mn.accidental !== bn.accidental) {
        conflicts.push({
          type: 'note_content',
          measureIndex: mi + 1,
          noteIndex: ni + 1,
          mainValue: mn.raw,
          branchValue: bn.raw,
          description: `第 ${mi + 1} 小节第 ${ni + 1} 个音：变音号 ${mn.accidental || ''} → ${bn.accidental || ''}`,
        });
      }
      if (mn.duration !== bn.duration) {
        conflicts.push({
          type: 'note_content',
          measureIndex: mi + 1,
          noteIndex: ni + 1,
          mainValue: mn.raw,
          branchValue: bn.raw,
          description: `第 ${mi + 1} 小节第 ${ni + 1} 个音：时值 ${mn.duration} → ${bn.duration}`,
        });
      }
    }
  }

  // 4) 结构性校验：验证每个小节的时值总和是否匹配拍号
  const beatsPerMeasure = branchParsed.totalBeats;
  const beatUnit = branchParsed.beatUnit || 4;
  for (let mi = 0; mi < branchParsed.measures.length; mi++) {
    const measure = branchParsed.measures[mi];
    const totalBeats = measure.notes.reduce((sum, n) => {
      if (n.isRest || n.isExtension) return sum + (beatUnit / Math.max(n.duration, 4));
      return sum + (beatUnit / n.duration) * (n.isDot ? 1.5 : 1);
    }, 0);
    if (Math.abs(totalBeats - beatsPerMeasure) > 0.01) {
      conflicts.push({
        type: 'structural',
        measureIndex: mi + 1,
        mainValue: `${beatsPerMeasure} 拍`,
        branchValue: `${totalBeats.toFixed(1)} 拍`,
        description: `第 ${mi + 1} 小节拍号 ${branchParsed.timeSignature}，应含 ${beatsPerMeasure} 拍，实际 ${totalBeats.toFixed(1)} 拍（时值${totalBeats > beatsPerMeasure ? '超出' : '不足'}）`,
      });
    }
  }

  // 汇总
  const hasConflict = conflicts.length > 0;
  const summary = hasConflict
    ? `检测到 ${conflicts.length} 处差异：${conflicts.map(c => c.description).join('；')}`
    : '主库与分支内容一致，无冲突';

  return { hasConflict, conflicts, summary };
}
