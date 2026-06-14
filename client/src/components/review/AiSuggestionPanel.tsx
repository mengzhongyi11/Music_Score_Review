import { useState, useEffect } from 'react';
import { Button } from '@/components/shared/Button';
import { PriorityBadge } from '@/components/shared/PriorityBadge';
import { useAiReviewStore } from '@/api/apiStore';
import styles from './AiSuggestionPanel.module.css';

type FilterTab = 'all' | 'P0' | 'P1' | 'P2' | 'pending';

const layerLabel: Record<string, string> = {
  rule: '规则层',
  rag: 'RAG 层',
  ai: 'AI 层',
};

export function AiSuggestionPanel({ scoreId }: { scoreId: number }) {
  const { suggestions, loading, fetchSuggestions, updateStatus } = useAiReviewStore();
  const [filter, setFilter] = useState<FilterTab>('pending');

  useEffect(() => {
    if (scoreId) fetchSuggestions(scoreId);
  }, [scoreId]);

  const filtered = suggestions.filter((s) => {
    if (filter === 'pending') return s.status === 'pending';
    if (filter === 'all') return true;
    return s.priority === filter;
  });

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>AI 审阅建议</h3>
        <span className={styles.count}>{suggestions.length} 条</span>
      </div>

      {/* 过滤器 */}
      <div className={styles.tabs}>
        {(['pending', 'all', 'P0', 'P1', 'P2'] as FilterTab[]).map((t) => (
          <button
            key={t}
            className={`${styles.tab} ${filter === t ? styles.tabActive : ''}`}
            onClick={() => setFilter(t)}
          >
            {t === 'pending' ? '待处理' : t === 'all' ? '全部' : t}
          </button>
        ))}
      </div>

      {/* 建议列表 */}
      <div className={styles.list}>
        {loading && <div className={styles.loading}>加载中…</div>}
        {!loading && filtered.length === 0 && (
          <div className={styles.empty}>暂无建议</div>
        )}
        {filtered.map((s) => (
          <div
            key={s.id}
            className={`${styles.card} ${s.status !== 'pending' ? styles.cardDone : ''}`}
          >
            <div className={styles.cardHeader}>
              <PriorityBadge priority={s.priority} />
              <span className={styles.layerTag}>{layerLabel[s.layer] || s.layer}</span>
              {s.status === 'pending' && (
                <span className={styles.statusPending}>待处理</span>
              )}
              {s.status === 'accepted' && <span className={styles.statusAccepted}>✓ 已接受</span>}
              {s.status === 'rejected' && <span className={styles.statusRejected}>✕ 已驳回</span>}
              {s.status === 'dismissed' && <span className={styles.statusDismissed}>－ 已忽略</span>}
            </div>

            <h4 className={styles.cardTitle}>{s.title}</h4>
            {s.content && <p className={styles.cardContent}>{s.content}</p>}
            {s.reason && (
              <details className={styles.reasonBox}>
                <summary className={styles.reasonSummary}>AI 判断理由</summary>
                <p className={styles.reasonText}>{s.reason}</p>
              </details>
            )}

            {s.status === 'pending' && (
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => updateStatus(s.id, 'accepted', 1)}
                >
                  接受
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => updateStatus(s.id, 'rejected', 1)}
                >
                  驳回
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => updateStatus(s.id, 'dismissed', 1)}
                >
                  忽略
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
