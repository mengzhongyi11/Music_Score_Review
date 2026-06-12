import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { Loading, ErrorMessage, EmptyState } from '@/components/shared/Loading';
import { ImportModal } from '@/components/shared/ImportModal';
import { useBranchesStore, useScoresStore, useSectionsStore } from '@/api/apiStore';
import styles from './DiffPage.module.css';

type PageMode = 'list' | 'diff' | 'content';

export function DiffPage() {
  const scoresAPI = useScoresStore();
  const branchesAPI = useBranchesStore();
  const sectionsAPI = useSectionsStore();

  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [mode, setMode] = useState<PageMode>('list');
  const [mergeResult, setMergeResult] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const prevBranchRef = useRef<number | null>(null);

  // 加载数据
  useEffect(() => { scoresAPI.fetchList(); }, []);
  const [currentScoreId, setCurrentScoreId] = useState<number>(1);

  // 数据加载后设置默认乐谱
  useEffect(() => {
    if (scoresAPI.list.data.length > 0 && currentScoreId === 1 && !scoresAPI.list.data.find(s => s.id === 1)) {
      setCurrentScoreId(scoresAPI.list.data[0].id);
    }
  }, [scoresAPI.list.data]);

  useEffect(() => {
    branchesAPI.fetchByScore(currentScoreId);
    sectionsAPI.fetchTree(currentScoreId);
  }, [currentScoreId]);

  // 默认选中
  useEffect(() => {
    if (branchesAPI.list.data.length > 0 && selectedBranchId === null) {
      const active = branchesAPI.list.data.find((b) => b.status === 'active');
      setSelectedBranchId(active?.id || branchesAPI.list.data[0].id);
    }
  }, [branchesAPI.list.data]);

  // 切换分支时加载 diff
  useEffect(() => {
    if (selectedBranchId && selectedBranchId !== prevBranchRef.current) {
      prevBranchRef.current = selectedBranchId;
      setMergeResult(null);
      branchesAPI.fetchDiff(selectedBranchId);
    }
  }, [selectedBranchId]);

  const selectedBranch = branchesAPI.list.data.find((b) => b.id === selectedBranchId);
  const isMerged = selectedBranch?.status === 'merged';
  const activeBranches = branchesAPI.list.data.filter((b) => b.status === 'active');
  const mergedBranches = branchesAPI.list.data.filter((b) => b.status === 'merged');

  // 合并
  const handleMerge = async () => {
    if (!selectedBranchId || isMerged) return;
    setMerging(true);
    try {
      await branchesAPI.mergeBranch(selectedBranchId);
      setMergeResult(`♩ 分支「${selectedBranch?.name}」已成功合并入主库`);
      window.dispatchEvent(new CustomEvent('merge-notification', {
        detail: { message: `分支「${selectedBranch?.name}」已合并到主分支`, branchName: selectedBranch?.name, scoreId: currentScoreId },
      }));
      await branchesAPI.fetchByScore(currentScoreId);
    } catch (err: any) {
      setMergeResult(`✕ 合并失败: ${err.message}`);
    } finally {
      setMerging(false);
    }
  };

  // Diff 数据
  const diffs = branchesAPI.diff.data?.diffs || [];
  const diffList = diffs.map((d: any) => ({
    sectionId: d.section_id,
    sectionName: d.name || d.main_name || `乐段 #${d.section_id}`,
    type: (d.content ? 'modified' : 'added') as string,
    content: d.content || '(新内容)',
    oldContent: d.main_content || '(无)',
    oldName: d.main_name,
  }));

  const stats = { modified: diffList.filter((d) => d.type === 'modified').length, added: diffList.filter((d) => d.type === 'added').length, total: diffList.length };

  const DiffBadge: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' }> = {
    added: { label: '新增', variant: 'success' },
    modified: { label: '修改', variant: 'warning' },
  };

  return (
    <div className={styles.page}>
      {/* 头部 */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>🎵 分支管理</h1>
          <p className={styles.subtitle}>
            <select
              className={styles.scoreSelect}
              value={currentScoreId}
              onChange={(e) => {
                setCurrentScoreId(Number(e.target.value));
                setSelectedBranchId(null);
                setMergeResult(null);
              }}
            >
              {scoresAPI.list.data.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <span className={styles.separator}>·</span>
            <strong>{branchesAPI.list.data.length}</strong> 个分支
            · <strong>{activeBranches.length}</strong> 个活跃
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="ghost" size="md" onClick={() => setShowImport(true)}>
            📂 导入到分支
          </Button>
          {selectedBranch && !isMerged && stats.total > 0 && (
            <Button variant="primary" size="md" onClick={handleMerge} loading={merging} disabled={merging}>
              {merging ? '合并中…' : `合并「${selectedBranch.name}」到主库`}
            </Button>
          )}
        </div>
      </div>

      {/* 合并结果 */}
      {mergeResult && (
        <div className={`${styles.mergeBanner} ${mergeResult.includes('♩') ? styles.mergeSuccess : styles.mergeError}`}>
          {mergeResult}
          <button className={styles.mergeDismiss} onClick={() => setMergeResult(null)}>✕</button>
        </div>
      )}

      {/* 主布局：左（分支列表）+ 右（内容/差异） */}
      <div className={styles.branchLayout}>
        {/* ── 左侧：分支列表 ── */}
        <div className={styles.branchSidebar}>
          <div className={styles.branchSidebarHeader}>
            <h3 className={styles.branchSidebarTitle}>所有分支</h3>
            <span className={styles.branchCount}>{branchesAPI.list.data.length}</span>
          </div>

          {branchesAPI.list.loading && <Loading size="sm" text="加载分支…" />}

          {/* 活跃分支 */}
          {activeBranches.length > 0 && (
            <div className={styles.branchGroup}>
              <span className={styles.branchGroupLabel}>♩ 活跃</span>
              {activeBranches.map((b) => (
                <button
                  key={b.id}
                  className={`${styles.branchItem} ${selectedBranchId === b.id ? styles.branchActive : ''}`}
                  onClick={() => { setSelectedBranchId(b.id); setMode('diff'); }}
                >
                  <span className={styles.branchItemDot} />
                  <span className={styles.branchItemName}>{b.name}</span>
                  <span className={styles.branchItemMeta}>{b.changes_count || 0} 处修改</span>
                </button>
              ))}
            </div>
          )}

          {/* 已合并分支 */}
          {mergedBranches.length > 0 && (
            <div className={styles.branchGroup}>
              <span className={styles.branchGroupLabel}>♩ 已合并</span>
              {mergedBranches.map((b) => (
                <button
                  key={b.id}
                  className={`${styles.branchItem} ${selectedBranchId === b.id ? styles.branchActive : ''}`}
                  onClick={() => { setSelectedBranchId(b.id); setMode('content'); }}
                >
                  <span className={styles.branchItemDot} style={{ background: 'var(--color-success-text)' }} />
                  <span className={styles.branchItemName}>{b.name}</span>
                  <span className={styles.branchItemMeta}>已合并</span>
                </button>
              ))}
            </div>
          )}

          {branchesAPI.list.data.length === 0 && !branchesAPI.list.loading && (
            <div className={styles.branchEmpty}>在审阅工作台创建分支</div>
          )}
        </div>

        {/* ── 右侧：内容区 ── */}
        <div className={styles.branchContent}>
          {!selectedBranch && (
            <EmptyState icon="🎵" title="选择分支" description="从左侧选择一个分支查看详情" />
          )}

          {selectedBranch && isMerged && (
            <div className={styles.mergedView}>
              <div className={styles.mergedHeader}>
                <Badge variant="success" label="♩ 已合并到主库" />
                <span className={styles.mergedName}>{selectedBranch.name}</span>
                <span className={styles.mergedCreator}>由 {selectedBranch.created_by_name || '—'} 创建</span>
                <span className={styles.mergedDate}>{new Date(selectedBranch.created_at).toLocaleDateString('zh-CN')}</span>
              </div>
              <div className={styles.mergedSections}>
                <h4 className={styles.mergedSectionTitle}>此分支的修改已全部合并到主库</h4>
                {/* 显示原分支的修改记录 */}
                {branchesAPI.diff.loading && <Loading size="sm" />}
                {diffList.map((d, i) => (
                  <div key={i} className={styles.mergedRow}>
                    <span className={styles.mergedSection}>{d.sectionName}</span>
                    <Badge variant={DiffBadge[d.type]?.variant || 'default'} label={DiffBadge[d.type]?.label || d.type} />
                    <span className={styles.mergedContent}>{d.content}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedBranch && !isMerged && branchesAPI.diff.loading && <Loading text="加载分支数据…" />}
          {selectedBranch && !isMerged && !branchesAPI.diff.loading && (
            <div className={styles.diffView}>
              {/* 分支信息 */}
              <div className={styles.diffBranchInfo}>
                <div>
                  <h2 className={styles.diffBranchName}>{selectedBranch.name}</h2>
                  <p className={styles.diffBranchMeta}>
                    由 {selectedBranch.created_by_name || '—'} 创建 · {new Date(selectedBranch.created_at).toLocaleDateString('zh-CN')}
                  </p>
                </div>
                <div className={styles.diffStats}>
                  <div className={styles.diffStat}>
                    <span className={styles.diffStatValue} style={{ color: 'var(--color-success-text)' }}>+{stats.added}</span>
                    <span className={styles.diffStatLabel}>新增</span>
                  </div>
                  <div className={styles.diffStat}>
                    <span className={styles.diffStatValue} style={{ color: 'var(--color-warning-text)' }}>±{stats.modified}</span>
                    <span className={styles.diffStatLabel}>修改</span>
                  </div>
                  <div className={styles.diffStat}>
                    <span className={styles.diffStatValue}>{stats.total}</span>
                    <span className={styles.diffStatLabel}>总计</span>
                  </div>
                </div>
              </div>

              {/* 主库 vs 分支 对照信息 */}
              <div className={styles.diffCompareHeader}>
                <span className={styles.diffCompareLabel}>主库 (main)</span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span className={styles.diffCompareLabel} style={{ color: 'var(--color-warning-text)' }}>{selectedBranch.name}</span>
              </div>

              {/* Diff 列表 */}
              {stats.total === 0 ? (
                <EmptyState icon="♪" title="与主库一致" description="此分支尚未做任何修改" />
              ) : (
                <div className={styles.diffList}>
                  {diffList.map((d, i) => (
                    <div key={i} className={`${styles.diffRow} ${styles[d.type] || ''}`}>
                      <div className={styles.diffRowSection}>
                        <span className={styles.diffSectionBadge}>#{d.sectionId}</span>
                        <span className={styles.diffSectionName}>{d.sectionName}</span>
                        <Badge variant={DiffBadge[d.type]?.variant || 'default'} label={DiffBadge[d.type]?.label || d.type} />
                      </div>
                      <div className={styles.diffRowContent}>
                        {d.type === 'modified' ? (
                          <div className={styles.diffInlineCompare}>
                            <span className={styles.diffOldValue}>{d.oldContent}</span>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={styles.diffArrow}><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            <span className={styles.diffNewValue}>{d.content}</span>
                          </div>
                        ) : (
                          <span className={styles.diffNewValue}>{d.content}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 操作区 */}
              {stats.total > 0 && (
                <div className={styles.diffActions}>
                  <Button variant="primary" size="md" onClick={handleMerge} loading={merging} disabled={merging}>
                    {merging ? '合并中…' : `♩ 将「${selectedBranch.name}」合并到主库`}
                  </Button>
                  <p className={styles.diffActionsHint}>
                    合并后分支的所有修改将应用到主库，此分支标记为已合并
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={(result) => {
            setShowImport(false);
            branchesAPI.fetchByScore(currentScoreId);
            if (result.branchId) setSelectedBranchId(result.branchId);
          }}
          scoreId={currentScoreId}
        />
      )}
    </div>
  );
}
