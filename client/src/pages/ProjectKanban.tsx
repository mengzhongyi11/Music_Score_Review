import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/shared/Button';
import { Loading, ErrorMessage } from '@/components/shared/Loading';
import { CreateScoreModal } from '@/components/shared/CreateScoreModal';
import { ImportModal } from '@/components/shared/ImportModal';
import { useScoresStore, useDashboardStore } from '@/api/apiStore';
import { commentsApi, reviewsApi } from '@/api';
import type { ScoreRow } from '@/api';
import styles from './ProjectKanban.module.css';

type ColumnKey = 'pending' | 'approved' | 'working' | 'rejected';

const columns: { key: ColumnKey; label: string; color: string }[] = [
  { key: 'pending',   label: '待审阅', color: 'var(--color-warning)' },
  { key: 'approved',  label: '已通过', color: 'var(--color-success-text)' },
  { key: 'working',   label: '工作中', color: '#58A6FF' },
  { key: 'rejected',  label: '已驳回', color: 'var(--color-danger-text)' },
];

/** 已通过/已驳回超过 7 天 → 看板列隐藏 */
function isExpired(reviewedAt?: string | null): boolean {
  if (!reviewedAt) return false;
  const days = (Date.now() - new Date(reviewedAt).getTime()) / 86400000;
  return days > 7;
}

/* 按 review_status 标签自动分配列（可重复出现在多列） */
function getColumnsForScore(score: ScoreRow): ColumnKey[] {
  const cols: ColumnKey[] = [];
  const st = score.review_status || 'approved';
  if (st === 'rejected') { cols.push('rejected'); return cols; }
  // 有批注 → 出现在待审阅
  if ((score.comment_count ?? 0) > 0) cols.push('pending');
  // 通过/无批注 → 出现在已通过
  if (st === 'approved' || (score.comment_count ?? 0) === 0) cols.push('approved');
  // 工作中（有未解决批注且状态为working）
  if (st === 'working') cols.push('working');
  return cols.length > 0 ? cols : ['approved'];
}

export function ProjectKanban() {
  const navigate = useNavigate();
  const scoresAPI = useScoresStore();
  const { stats, fetchStats } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [reviewTarget, setReviewTarget] = useState<{ scoreId: number; name: string } | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    scoresAPI.fetchList();
    fetchStats();
    // 加载所有批注
    commentsApi.getAll().then(setAnnotations).catch(() => {});
  }, []);

  // 搜索过滤
  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val.trim()) scoresAPI.searchScores(val.trim());
    else scoresAPI.fetchList();
  }, []);

  const handleReview = async (status: 'approved' | 'rejected') => {
    if (!reviewTarget) return;
    setReviewing(true);
    try {
      await reviewsApi.submit(reviewTarget.scoreId, { status, comment: reviewComment || undefined, reviewer_id: 1 });
      setReviewTarget(null);
      setReviewComment('');
      scoresAPI.fetchList();
      alert(status === 'approved' ? '♩ 已通过' : '已驳回');
    } catch (err: any) {
      alert('操作失败: ' + err.message);
    } finally { setReviewing(false); }
  };

  const isLoading = scoresAPI.list.loading && scoresAPI.list.data.length === 0;

  return (
    <div className={styles.page}>
      {/* 页面头部 */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>项目管理</h1>
          <p className={styles.subtitle}>
            协作审阅看板 · 共 {scoresAPI.list.data.length} 个乐谱项目
            {stats.data && <span> · 待处理 {stats.data.pendingReviews} 条</span>}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" size="md" onClick={() => setShowCreateModal(true)}>新建项目</Button>
          <Button variant="ghost" size="md" onClick={() => setShowImportModal(true)}>📂 导入 MusicXML</Button>
          <Button variant="primary" size="md">邀请成员</Button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className={styles.toolbar}>
        <div className={styles.searchBar}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.2"/><path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          <input
            type="text"
            placeholder="搜索乐谱名称或作曲者..."
            className={styles.searchInput}
            value={searchQuery}
            onChange={handleSearch}
          />
        </div>
      </div>

      {/* Loading / Error */}
      {isLoading && <Loading text="加载乐谱列表…" />}
      {scoresAPI.list.error && <ErrorMessage message={scoresAPI.list.error} onRetry={() => scoresAPI.fetchList()} />}

      {/* 空库提示 */}
      {!isLoading && !scoresAPI.list.error && scoresAPI.list.data.length === 0 && (
        <div className={styles.emptyLibrary}>
          <div className={styles.emptyLibIcon}>🎵</div>
          <h2 className={styles.emptyLibTitle}>还没有乐谱</h2>
          <p className={styles.emptyLibDesc}>创建新乐谱或导入 MusicXML 文件</p>
          <div className={styles.emptyLibActions}>
            <Button variant="primary" size="md" onClick={() => setShowCreateModal(true)}>新建乐谱</Button>
            <Button variant="secondary" size="md" onClick={() => setShowImportModal(true)}>📂 导入 MusicXML</Button>
          </div>
        </div>
      )}

      {/* Kanban 列 — 每条批注为一张卡片 */}
      {!isLoading && !scoresAPI.list.error && scoresAPI.list.data.length > 0 && (
        <div className={styles.kanban}>
          {columns.map((col) => {
            let cards: { id: string; scoreId: number; name: string; content: string; date: string }[] = [];

            if (col.key === 'rejected') {
              // 驳回：显示 rejected 乐谱（超过7天自动隐藏）
              cards = scoresAPI.list.data
                .filter((s) => s.review_status === 'rejected' && !isExpired(s.reviewed_at))
                .map((s) => ({ id: `r-${s.id}`, scoreId: s.id, name: s.name, content: '已驳回', date: '' }));
            } else if (col.key === 'working') {
              // 工作中：有未解决批注的乐谱（已通过或工作中）
              const workingScoreIds = new Set(
                annotations.filter((a) => a.status === 'open' && a.review_status !== 'rejected').map((a) => a.score_id)
              );
              cards = scoresAPI.list.data
                .filter((s) => workingScoreIds.has(s.id))
                .map((s) => ({ id: `w-${s.id}`, scoreId: s.id, name: s.name, content: '工作中', date: '' }));
            } else if (col.key === 'pending') {
              // 待审阅：每个未解决的批注一张卡片 + 审阅按钮
              cards = annotations
                .filter((a) => a.status === 'open' && a.review_status !== 'approved')
                .map((a) => ({
                  id: `a-${a.id}`,
                  scoreId: a.score_id,
                  name: a.score_name,
                  content: a.content,
                  date: new Date(a.created_at).toLocaleDateString('zh-CN'),
                }));
            } else {
              // 已通过：无批注或全部解决的乐谱（超过7天自动隐藏）
              cards = scoresAPI.list.data
                .filter((s) => ((s.comment_count ?? 0) === 0 || s.review_status === 'approved') && !isExpired(s.reviewed_at))
                .map((s) => ({ id: `ap-${s.id}`, scoreId: s.id, name: s.name, content: '✓ 已通过', date: '' }));
            }

            return (
              <div key={col.key} className={styles.column}>
                <div className={styles.columnHeader}>
                  <span className={styles.columnDot} style={{ background: col.color }} />
                  <span className={styles.columnTitle}>{col.label}</span>
                  <span className={styles.columnCount}>{cards.length}</span>
                </div>
                <div className={styles.cardList}>
                  {cards.map((card) => (
                    <div
                      key={card.id}
                      className={`${styles.card} ${col.key === 'pending' ? styles.cardPending : ''}`}
                      onClick={() => navigate(`/review?scoreId=${card.scoreId}`)}
                    >
                      <div className={styles.cardBody}>
                        <h3 className={styles.cardTitle}>{card.name}</h3>
                        <p className={styles.cardAnnotation}>{card.content}</p>
                        <div className={styles.cardFooter}>
                          {card.date && <span className={styles.metaText}>{card.date}</span>}
                          {col.key === 'pending' && (
                            <button className={styles.reviewBtn} onClick={(e) => { e.stopPropagation(); setReviewTarget({ scoreId: card.scoreId, name: card.name }); }}>
                              审阅
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <div className={styles.emptyColumn}>
                      <span className={styles.emptyText}>无</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <CreateScoreModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => navigate(`/review?scoreId=${id}`)}
        />
      )}

      {/* 审阅对话框 */}
      {reviewTarget && (
        <div className={styles.overlay} onClick={() => setReviewTarget(null)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.dialogTitle}>♩ 审阅乐谱</h3>
            <p className={styles.dialogDesc}>对「{reviewTarget.name}」做出审阅结论</p>
            <textarea className={styles.dialogInput} placeholder="审阅意见（可选）…" value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={3} />
            <div className={styles.dialogActions}>
              <Button variant="secondary" size="md" onClick={() => setReviewTarget(null)}>取消</Button>
              <Button variant="danger" size="md" onClick={() => handleReview('rejected')} loading={reviewing} disabled={reviewing}>❌ 驳回</Button>
              <Button variant="primary" size="md" onClick={() => handleReview('approved')} loading={reviewing} disabled={reviewing}>✅ 通过</Button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <ImportModal
          scores={scoresAPI.list.data}
          onClose={() => setShowImportModal(false)}
          onImported={(result) => {
            setShowImportModal(false);
            scoresAPI.fetchList();
            if (result.branchId) navigate(`/diff`);
            else if (result.scoreId) navigate(`/review?scoreId=${result.scoreId}`);
          }}
        />
      )}
    </div>
  );
}
