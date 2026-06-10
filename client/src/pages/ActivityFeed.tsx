import { useEffect } from 'react';
import { useDashboardStore } from '@/api/apiStore';
import { Loading, ErrorMessage, EmptyState } from '@/components/shared/Loading';
import { Button } from '@/components/shared/Button';
import styles from './ActivityFeed.module.css';

const typeConfig: Record<string, { icon: string; label: string }> = {
  comment: { icon: '🎵', label: '批注' },
  merge: { icon: '🎶', label: '合并' },
  version: { icon: '♩', label: '版本' },
  create_score: { icon: '🎼', label: '创建乐谱' },
};

export function ActivityFeed() {
  const { feed, fetchFeed } = useDashboardStore();

  useEffect(() => {
    fetchFeed(50);
  }, []);

  const feedData = feed.data;

  // 按日期分组
  const grouped = feedData.reduce<Record<string, typeof feedData>>((acc, item) => {
    const day = new Date(item.time).toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    });
    if (!acc[day]) acc[day] = [];
    acc[day].push(item);
    return acc;
  }, {});

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>活动动态</h1>
          <p className={styles.subtitle}>协作时间线 · 实时记录所有操作</p>
        </div>
        <Button variant="secondary" size="md" onClick={() => fetchFeed(50)}>
          ♪ 刷新
        </Button>
      </div>

      {feed.loading && feedData.length === 0 && <Loading text="加载动态…" />}
      {feed.error && <ErrorMessage message={feed.error} onRetry={() => fetchFeed(50)} />}

      {!feed.loading && !feed.error && feedData.length === 0 && (
        <EmptyState icon="♪" title="暂无动态" description="协作操作会显示在这里" />
      )}

      {!feed.loading && !feed.error && feedData.length > 0 && (
        <div className={styles.timeline}>
          {Object.entries(grouped).map(([day, items]) => (
            <div key={day} className={styles.dayGroup}>
              <div className={styles.dayHeader}>
                <span className={styles.dayLine} />
                <span className={styles.dayLabel}>{day}</span>
                <span className={styles.dayLine} />
              </div>
              <div className={styles.items}>
                {items.map((item, i) => {
                  const cfg = typeConfig[item.type] || { icon: '♪', label: item.type };
                  return (
                    <div key={i} className={styles.feedItem}>
                      <div className={styles.feedIcon}>{cfg.icon}</div>
                      <div className={styles.feedBody}>
                        <div className={styles.feedHeader}>
                          <span className={styles.feedUser}>{item.user_name || '系统'}</span>
                          <span className={styles.feedType}>{cfg.label}</span>
                          <span className={styles.feedTime}>
                            {new Date(item.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className={styles.feedSummary}>{item.summary}</p>
                        <span className={styles.feedScore}>🎼 {item.score_name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
