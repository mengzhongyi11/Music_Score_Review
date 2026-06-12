import { useEffect, useState, useCallback } from 'react';
import { useSectionsStore } from '@/api/apiStore';
import { versionsApi } from '@/api';
import { Loading } from '@/components/shared/Loading';
import { Button } from '@/components/shared/Button';
import styles from './VersionTimeline.module.css';

interface VersionTimelineProps {
  sectionId?: number | null;
  onRollback?: (sectionId: number) => void;
}

export function VersionTimeline({ sectionId, onRollback }: VersionTimelineProps) {
  const { versions, fetchVersions } = useSectionsStore();
  const [rollbackTarget, setRollbackTarget] = useState<{ id: number; label: string } | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  useEffect(() => {
    if (sectionId) {
      fetchVersions(sectionId);
    }
  }, [sectionId]);

  const handleRollback = useCallback(async () => {
    if (!rollbackTarget || !sectionId) return;
    setRollingBack(true);
    try {
      const result = await versionsApi.rollback(rollbackTarget.id);
      // 刷新版本列表和当前乐段
      await fetchVersions(sectionId);
      onRollback?.(sectionId);
      setRollbackTarget(null);
    } catch (err: any) {
      alert('回溯失败: ' + (err.message || '未知错误'));
    } finally {
      setRollingBack(false);
    }
  }, [rollbackTarget, sectionId, fetchVersions, onRollback]);

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
              {data.slice(0, 8).map((v, i) => {
                // 避免单版本时 left=NaN
                const denom = Math.max(data.length - 1, 1);
                const leftPct = (i / Math.min(denom, 7)) * 100;
                return (
                  <button
                    key={v.id}
                    className={`${styles.node} ${i === 0 ? styles.current : ''}`}
                    style={{ left: `${leftPct}%` }}
                    title={`${v.name} · ${new Date(v.created_at).toLocaleString('zh-CN')}`}
                    onClick={() => {
                      if (i > 0) {
                        setRollbackTarget({ id: v.id, label: `v${data.length - i}` });
                      }
                    }}
                  >
                    <span className={styles.nodeDot}>
                      {i === 0 && <span className={styles.glow} />}
                    </span>
                    <span className={styles.nodeLabel}>v{data.length - i}</span>
                    <span className={styles.nodeAuthor}>
                      {new Date(v.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                    </span>
                  </button>
                );
              })}
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

      {/* 回溯确认对话框 */}
      {rollbackTarget && (
        <div className={styles.overlay} onClick={() => setRollbackTarget(null)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.dialogTitle}>↩ 版本回溯</h3>
            <p className={styles.dialogDesc}>
              确定要回溯到 <strong>{rollbackTarget.label}</strong> 吗？
            </p>
            <p className={styles.dialogHint}>
              当前版本将会被自动保存，你可以在版本历史中找到它。
            </p>
            <div className={styles.dialogActions}>
              <Button variant="secondary" size="md" onClick={() => setRollbackTarget(null)}>
                取消
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={rollingBack}
                onClick={handleRollback}
              >
                确认回溯
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
