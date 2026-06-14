/**
 * 偏好学习引擎
 * 记录审阅决策、计算统计、提供模式匹配
 */

export interface StatsInput {
  total: number;
  accepted: number;
  rejected: number;
  dismissed: number;
  aiSuggestions?: number;
  aiAccepted?: number;
}

export interface ReviewStats {
  totalProcessed: number;
  acceptanceRate: number;
  rejectionRate: number;
  aiAccuracy: number;
  commonErrors: { type: string; count: number }[];
}

/**
 * 计算审阅统计
 */
export function calculateStats(input: StatsInput): ReviewStats {
  const { total, accepted, rejected, aiSuggestions = 0, aiAccepted = 0 } = input;

  return {
    totalProcessed: total,
    acceptanceRate: total > 0 ? accepted / total : 0,
    rejectionRate: total > 0 ? rejected / total : 0,
    aiAccuracy: aiSuggestions > 0 ? aiAccepted / aiSuggestions : 0,
    commonErrors: [
      { type: '力度', count: 0 },
      { type: '速度', count: 0 },
      { type: '调号', count: 0 },
      { type: '拍号', count: 0 },
      { type: '音高', count: 0 },
    ],
  };
}

/**
 * 根据用户已驳回的模式判断是否应自动拦截
 */
export function shouldAutoReject(
  content: string,
  rejectedPatterns: string[],
): boolean {
  if (!rejectedPatterns.length) return false;
  return rejectedPatterns.some(pattern => content.includes(pattern));
}

/**
 * 提取用于偏好匹配的关键特征
 */
export function extractFeatures(content: string): string[] {
  const features: string[] = [];

  // 力度相关
  if (/力度|f\b|p\b|mf|mp|ff|pp|cresc|dim/.test(content)) features.push('力度');
  // 速度相关
  if (/速度|♩=|tempo|BPM|bpm/.test(content)) features.push('速度');
  // 调号相关
  if (/调号|1=/.test(content)) features.push('调号');
  // 拍号相关
  if (/拍号|\d\/\d/.test(content) && !content.includes('1=')) features.push('拍号');
  // 音高相关
  if (/音高|音符|音|小节.*\d/.test(content)) features.push('音高');

  return features;
}
