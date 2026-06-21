/**
 * Layer 2: RAG 规则知识库过滤器
 *
 * 基于 GB/T 46845-2025 简谱规范 + 简谱五线谱映射规范，
 * 对用户批注内容进行规则相关性匹配。
 *
 * 匹配成功 → 返回匹配的规则参考上下文（传给 AI 层或直接通过）
 * 完全无匹配 → 返回未通过（内容不在规则覆盖范围内）
 */

import { searchRules } from './ruleKnowledgeBase';

export interface RagFilterResult {
  passed: boolean;
  reason?: string;
  /** RAG 匹配到的规则上下文（给 AI 层参考） */
  context?: string;
  /** 匹配到的规则列表（用于展示） */
  matchedRules?: { sectionId: string; title: string; score: number }[];
}

/**
 * RAG 规则匹配
 * @param input 用户批注内容
 */
export async function ragFilter(input: string): Promise<RagFilterResult> {
  const text = input.trim();
  if (!text) {
    return { passed: false, reason: '内容为空' };
  }

  // 搜索知识库中的匹配规则（向量检索优先，关键词降级）
  const matches = await searchRules(text, 3);

  // 完全无匹配：内容与简谱规范无关
  if (matches.length === 0 || matches[0].score < 5) {
    return {
      passed: false,
      reason: '内容与简谱记谱规范无关联，建议确认是否为有效审阅意见',
    };
  }

  // 有匹配：返回上下文供后续使用
  const matchedRules = matches
    .filter(m => m.score >= 5)
    .map(m => ({
      sectionId: m.entry.sectionId,
      title: m.entry.title,
      score: m.score,
    }));

  const context = matches
    .map(m => `§${m.entry.sectionId} ${m.entry.title}：${m.entry.description.slice(0, 100)}`)
    .join('\n');

  return {
    passed: true,
    context,
    matchedRules,
  };
}

/**
 * 用于 RAG 匹配失败时的测试（不含用户偏好权重）
 */
export async function ragFilterTest(input: string): Promise<{
  passed: boolean;
  matches: { sectionId: string; title: string; score: number; snippet: string }[];
}> {
  const matches = await searchRules(input, 3);

  return {
    passed: matches.length > 0 && matches[0].score >= 5,
    matches: matches.map(m => ({
      sectionId: m.entry.sectionId,
      title: m.entry.title,
      score: m.score,
      snippet: m.entry.description.slice(0, 80),
    })),
  };
}
