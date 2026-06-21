/**
 * AI 审阅服务 — 三层过滤流水线编排
 *
 * Layer 1 (规则) → Layer 2 (RAG 规则知识库) → Layer 3 (AI/LLM)
 * 任一层拦截即返回，只有通过前两层才调用 LLM
 */

import pool from '../db';
import { ruleFilter, guessPriorityFromRule } from './ruleFilter';
import { ragFilter } from './ragFilter';
import { aiReviewWithFallback } from './dashScopeProvider';

export interface AnalyzeInput {
  scoreId: number;
  branchId?: number;
  sectionId?: number;
  content: string;
  title?: string;
  userId?: number;
}

export interface AnalyzeResult {
  passed: boolean;
  layer: 'rule' | 'rag' | 'ai';
  suggestionType: 'auto_accept' | 'auto_reject' | 'discuss' | 'info';
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  reason: string;
  ragContext?: string;
}

/**
 * 运行三层过滤流水线
 */
export async function analyzeSubmission(input: AnalyzeInput): Promise<AnalyzeResult> {
  const { content, title } = input;

  // ======== Layer 1: 规则过滤 ========
  const ruleResult = ruleFilter(content);
  if (!ruleResult.passed) {
    return {
      passed: false,
      layer: 'rule',
      suggestionType: ruleResult.suggestionType || 'auto_reject',
      priority: 'P2',
      title: title || '规则层自动驳回',
      reason: ruleResult.reason || '未通过规则检查',
    };
  }

  // ======== Layer 2: RAG 规则知识库匹配 ========
  const ragResult = await ragFilter(content);
  if (!ragResult.passed) {
    return {
      passed: false,
      layer: 'rag',
      suggestionType: 'auto_reject',
      priority: 'P2',
      title: title || 'RAG 规则库未匹配',
      reason: ragResult.reason || '内容与简谱记谱规范无关联',
    };
  }

  // RAG 通过 → 附加上下文给 AI 层
  try {
    const ragContext = ragResult.context;
    const aiResult = await aiReviewWithFallback(content, ragContext);
    return {
      passed: true,
      layer: 'ai',
      suggestionType: aiResult.suggestionType,
      priority: aiResult.priority,
      title: aiResult.title || title || 'AI 审阅建议',
      reason: aiResult.reason,
      ragContext,
    };
  } catch (err) {
    const priority = guessPriorityFromRule(content);
    return {
      passed: true,
      layer: 'rag',
      suggestionType: 'discuss',
      priority: priority,
      title: title || 'AI 审阅建议',
      reason: 'AI 服务暂不可用，已降级为人工处理（RAG 上下文可用）',
      ragContext: ragResult.context,
    };
  }
}

/**
 * 保存分析结果到数据库
 */
export async function saveSuggestion(
  input: AnalyzeInput,
  result: AnalyzeResult,
  ragContext?: string,
): Promise<number> {
  const [insertResult] = await pool.query(
    `INSERT INTO review_suggestions (score_id, branch_id, section_id, layer, suggestion_type, priority, title, content, reason, rag_context, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      input.scoreId,
      input.branchId || null,
      input.sectionId || null,
      result.layer,
      result.suggestionType,
      result.priority,
      result.title,
      input.content,
      result.reason,
      ragContext || null,
      input.userId || 1,
    ]
  );
  return (insertResult as any).insertId;
}
