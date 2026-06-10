import { useEffect } from 'react';
import { useSectionsStore } from '@/api/apiStore';
import { Loading } from '@/components/shared/Loading';
import styles from './VersionTimeline.module.css';

interface VersionTimelineProps {
  sectionId?: number | null;
}

export function VersionTimeline({ sectionId }: VersionTimelineProps) {
  const { versions, fetchVersions } = useSectionsStore();

  useEffect(() => {
    if (sectionId) {
      fetchVersions(sectionId);
    }
  }, [sectionId]);

  if (!sectionId) {
    return (
      <div className={styles.timeline}>
        <div className={styles.empty}>选择乐段查看版本历史</div>
      </div>
    );
  }

  const data = versions.data;
  const currentVersion = data[0]; // 最新版本作为"当前"

  return (
    <div className={styles.timeline}>
      {versions.loading && <Loading size="sm" text="加载版本历史…" />}
      {!versions.loading && data.length === 0 && (
        <div className={styles.empty}>暂无版本历史</div>
      )}
      {!versions.loading && data.length > 0 && (
        <>
          <div className={styles.track}>
            <div className={styles.line} />
            <div className={styles.nodes}>
              {data.slice(0, 8).map((v, i) => (
                <button
                  key={v.id}
                  className={`${styles.node} ${i === 0 ? styles.current : ''}`}
                  style={{ left: `${(i / Math.min(data.length - 1, 7)) * 100}%` }}
                  title={`${v.name} · ${new Date(v.created_at).toLocaleString('zh-CN')}`}
                >
                  <span className={styles.nodeDot}>
                    {i === 0 && <span className={styles.glow} />}
                  </span>
                  <span className={styles.nodeLabel}>v{data.length - i}</span>
                  <span className={styles.nodeAuthor}>
                    {new Date(v.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className={styles.info}>
            <span className={styles.versionTag}>
              当前版本: <strong>{currentVersion?.name || '—'}</strong>
            </span>
            <span className={styles.versionMeta}>
              {currentVersion?.created_at
                ? new Date(currentVersion.created_at).toLocaleString('zh-CN')
                : '—'}
              · 共 {data.length} 个版本
            </span>
          </div>
        </>
      )}
    </div>
  );
}
