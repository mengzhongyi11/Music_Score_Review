/**
 * 影响分析引擎
 * 分析修改对乐谱整体的影响（规则层 + AI 层）
 */
import { parseJianpu } from '../utils/notation';

export interface ImpactItem {
  type: 'harmonic' | 'voice_leading' | 'dynamic' | 'tempo' | 'key' | 'structure';
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
}

export interface ImpactResult {
  sectionId: string;
  sectionName: string;
  overallRisk: 'high' | 'medium' | 'low';
  impacts: ImpactItem[];
}

export interface ImpactInput {
  sectionId?: string;
  sectionName: string;
  mainContent: string;
  branchContent: string;
}

/**
 * 规则层影响分析（零 AI 成本）
 */
export function analyzeSectionImpact(input: ImpactInput): ImpactResult {
  const impacts: ImpactItem[] = [];

  const mainParsed = parseJianpu(input.mainContent);
  const branchParsed = parseJianpu(input.branchContent);

  // 1) 速度变化检测
  const mainTempo = mainParsed.tempo || '';
  const branchTempo = branchParsed.tempo || '';
  if (mainTempo && branchTempo && mainTempo !== branchTempo) {
    const mainBpm = extractBpm(mainTempo);
    const branchBpm = extractBpm(branchTempo);
    if (mainBpm && branchBpm) {
      const diff = Math.abs(mainBpm - branchBpm);
      if (diff > 20) {
        impacts.push({
          type: 'tempo',
          severity: 'high',
          description: `速度变化 ${diff} BPM（${mainBpm} → ${branchBpm}），超过 20 BPM 阈值`,
          suggestion: '大幅速度变化会影响乐章整体风格和演奏效果，建议确认是否必要',
        });
      } else if (diff > 10) {
        impacts.push({
          type: 'tempo',
          severity: 'medium',
          description: `速度变化 ${diff} BPM（${mainBpm} → ${branchBpm}）`,
          suggestion: '中等速度调整，需确保与相邻乐章的速度对比合理',
        });
      }
    }
  }

  // 2) 调号变化检测
  if (mainParsed.key !== branchParsed.key) {
    impacts.push({
      type: 'key',
      severity: 'high',
      description: `调号从 ${mainParsed.key} 改为 ${branchParsed.key}`,
      suggestion: '调号变更影响全曲音高体系，需确认是否为有意转调',
    });
  }

  // 3) 拍号变化检测
  if (mainParsed.timeSignature !== branchParsed.timeSignature) {
    impacts.push({
      type: 'structure',
      severity: 'high',
      description: `拍号从 ${mainParsed.timeSignature} 改为 ${branchParsed.timeSignature}`,
      suggestion: '拍号变更影响全部小节的重音结构和节拍划分',
    });
  }

  // 4) 内容长度大幅变化
  const mainNoteCount = mainParsed.measures.reduce((s, m) => s + m.notes.length, 0);
  const branchNoteCount = branchParsed.measures.reduce((s, m) => s + m.notes.length, 0);
  if (mainNoteCount > 0 && branchNoteCount > 0) {
    const ratio = Math.max(mainNoteCount, branchNoteCount) / Math.min(mainNoteCount, branchNoteCount);
    if (ratio > 1.5) {
      impacts.push({
        type: 'structure',
        severity: 'high',
        description: `音符数量大幅变化（${mainNoteCount} → ${branchNoteCount}，比例 ${ratio.toFixed(1)}x）`,
        suggestion: '内容长度变化超过 50%，建议检查是否有遗漏或多余小节',
      });
    }
  }

  // 汇总风险等级
  const highCount = impacts.filter(i => i.severity === 'high').length;
  const medCount = impacts.filter(i => i.severity === 'medium').length;
  const overallRisk: 'high' | 'medium' | 'low' =
    highCount > 0 ? 'high' : medCount > 0 ? 'medium' : 'low';

  return {
    sectionId: input.sectionId || 'unknown',
    sectionName: input.sectionName,
    overallRisk,
    impacts,
  };
}

/**
 * 从速度文本中提取 BPM 数值
 * 如 "♩=120" → 120, "♩=96" → 96
 */
function extractBpm(tempoText: string): number | null {
  const match = tempoText.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}
