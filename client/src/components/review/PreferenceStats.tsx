import { useState, useEffect } from 'react';
import { preferencesApi } from '@/api';
import styles from './PreferenceStats.module.css';

interface Stats {
  totalProcessed: number;
  acceptanceRate: number;
  aiAccuracy: number;
}

export function PreferenceStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    preferencesApi.getStats(1)
      .then(data => setStats(data.stats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>AI 审阅统计</h3>
      </div>

      {loading && <div className={styles.loading}>加载中…</div>}

      {stats && (
        <div className={styles.content}>
          <div className={styles.statRow}>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{stats.totalProcessed}</span>
              <span className={styles.statLabel}>已处理建议</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{(stats.acceptanceRate * 100).toFixed(0)}%</span>
              <span className={styles.statLabel}>接受率</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{(stats.aiAccuracy * 100).toFixed(0)}%</span>
              <span className={styles.statLabel}>AI 准确率</span>
            </div>
          </div>

          <div className={styles.barSection}>
            <span className={styles.barLabel}>接受率</span>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: `${stats.acceptanceRate * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      {!loading && !stats && (
        <div className={styles.empty}>暂无统计数据</div>
      )}
    </div>
  );
}
