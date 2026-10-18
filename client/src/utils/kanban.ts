import type { CommentWithScore, ScoreRow } from '@/api';

/**
 * 看板列的数据推导 —— 全站唯一真源。
 *
 * 之前 ProjectKanban 与 Sidebar 各写了一套统计逻辑：
 *   - 看板按「批注 + 审阅状态」推导卡片
 *   - 侧边栏直接按 score.review_status 数乐谱
 * 两者口径不同，导致同一状态在侧边栏和看板显示的数字对不上。
 *
 * 现在统一走这里：看板用它渲染卡片，侧边栏用它取每列的数量。
 */

export type KanbanStatus = 'pending' | 'working' | 'approved' | 'rejected';

export interface KanbanCard {
  id: string;
  scoreId: number;
  name: string;
  content: string;
  date: string;
}

/** 已通过 / 已驳回在 7 天后从看板隐藏 */
export const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export function isExpired(date: string | null | undefined, now: number = Date.now()): boolean {
  if (!date) return false;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return false;
  return now - t > EXPIRY_MS;
}

/**
 * 按原规则推导四列卡片。
 *
 * 规则（与迁移前的 ProjectKanban 完全一致，勿随意修改）：
 *   - 已驳回：review_status === 'rejected' 且未过期
 *   - 工作中：有未解决批注、且不是已驳回的乐谱
 *   - 待审阅：**每条**未解决批注一张卡片，且所属乐谱不是已通过
 *   - 已通过：无批注或已通过的乐谱，且未过期
 */
export function buildKanbanColumns(
  scores: ScoreRow[],
  annotations: CommentWithScore[],
  now: number = Date.now(),
): Record<KanbanStatus, KanbanCard[]> {
  const rejected: KanbanCard[] = scores
    .filter((s) => s.review_status === 'rejected' && !isExpired(s.reviewed_at, now))
    .map((s) => ({ id: `r-${s.id}`, scoreId: s.id, name: s.name, content: '已驳回', date: '' }));

  const workingScoreIds = new Set(
    annotations
      .filter((a) => a.status === 'open' && a.review_status !== 'rejected')
      .map((a) => a.score_id),
  );
  const working: KanbanCard[] = scores
    .filter((s) => workingScoreIds.has(s.id))
    .map((s) => ({ id: `w-${s.id}`, scoreId: s.id, name: s.name, content: '工作中', date: '' }));

  const pending: KanbanCard[] = annotations
    .filter((a) => a.status === 'open' && a.review_status !== 'approved')
    .map((a) => ({
      id: `a-${a.id}`,
      scoreId: a.score_id,
      name: a.score_name || `乐谱 #${a.score_id}`,
      content: a.content,
      date: new Date(a.created_at).toLocaleDateString('zh-CN'),
    }));

  const approved: KanbanCard[] = scores
    .filter(
      (s) =>
        ((s.comment_count ?? 0) === 0 || s.review_status === 'approved') &&
        !isExpired(s.reviewed_at, now),
    )
    .map((s) => ({ id: `ap-${s.id}`, scoreId: s.id, name: s.name, content: '✓ 已通过', date: '' }));

  return { pending, working, approved, rejected };
}

/** 只取各列数量，供侧边栏使用。 */
export function countKanbanColumns(
  scores: ScoreRow[],
  annotations: CommentWithScore[],
  now: number = Date.now(),
): Record<KanbanStatus, number> {
  const cols = buildKanbanColumns(scores, annotations, now);
  return {
    pending: cols.pending.length,
    working: cols.working.length,
    approved: cols.approved.length,
    rejected: cols.rejected.length,
  };
}
