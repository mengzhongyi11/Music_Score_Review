import { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { Loading, ErrorMessage, EmptyState } from '@/components/shared/Loading';
import { ImportModal } from '@/components/shared/ImportModal';
import { VexflowStaff } from '@/components/notation/VexflowStaff';
import { ConflictCard } from '@/components/review/ConflictCard';
import { useBranchesStore, useScoresStore, useSectionsStore } from '@/api/apiStore';
import { parseJianpu, computeMeasureTies } from '@/utils/notation';
import { mergeApi } from '@/api';
import type { ConflictRow } from '@/api';
import styles from './DiffPage.module.css';
import diffStyles from './DiffPage.module.css';

/* 简谱迷你渲染（用于 diff 对比 — 完整支持简谱规范） */
function JianpuMini({ content }: { content: string }) {
  const isNotation = content?.trim().match(/^1=\S+\s+\d+\/\d+/m);
  if (!content || !isNotation) {
    return <span className={diffStyles.diffOldValue}>{content}</span>;
  }

  const parsed = parseJianpu(content);
  if (parsed.measures.length === 0) {
    return <span className={diffStyles.diffOldValue}>{content}</span>;
  }

  const measuresWithTies = computeMeasureTies(parsed.measures);

  return (
    <div className={diffStyles.diffJianpu}>
      <span className={diffStyles.diffJianpuKey}>{parsed.key}</span>
      <span className={diffStyles.diffJianpuTs}>{parsed.timeSignature}</span>
      {measuresWithTies.map((m, mi) => {
        // 计算每个音符宽度布局
        const GAP = 4;
        type Layout = { w: number; x: number };
        const layouts: Layout[] = [];
        let xAcc = 0;
        for (const n of m.notes) {
          const w = n.isRest || n.isExtension ? 24
            : Math.max(18, 20 * (4 / n.duration) * (n.isDot ? 1.4 : 1));
          layouts.push({ w, x: xAcc });
          xAcc += w + GAP;
        }
        const measW = Math.max(xAcc, 1);
        const measH = 40;

        // ---- 检测小节内连音组 ----
        // 规则：当音符 N 有 hasTie 且下个音符 N+1 有 hasTieEnd 时才画弧线
        type TieG = { fromX: number; toX: number; dist: number };
        const ties: TieG[] = [];
        let ti = 0;
        while (ti < m.notes.length - 1) {
          if (m.notes[ti].hasTie && m.notes[ti + 1].hasTieEnd) {
            const start = ti;
            let end = ti + 1;
            // 延长到连续有 hasTie+hasTieEnd 的链条末端
            while (end + 1 < m.notes.length && m.notes[end].hasTie && m.notes[end + 1].hasTieEnd) {
              end++;
            }
            const from = layouts[start];
            const to = layouts[end];
            const fx = from.x + from.w / 2;
            const tx = to.x + to.w / 2;
            ties.push({ fromX: fx, toX: tx, dist: tx - fx });
            ti = end;
          } else {
            ti++;
          }
        }

        return (
          <span key={mi} className={diffStyles.diffJianpuMeasure} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', minHeight: `${measH}px` }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: `${GAP}px`, padding: '14px 0 0 0', position: 'relative', zIndex: 1 }}>
              {m.notes.map((n, ni) => {
                if (n.isRest) return <span key={ni} className={diffStyles.jpRest}>0</span>;
                if (n.isExtension) return <span key={ni} className={diffStyles.jpExt}>—</span>;

                // 和弦渲染
                if (n.isChord && n.chordNotes && n.chordNotes.length > 1) {
                  const sorted = [...n.chordNotes].sort((a, b) => {
                    const aV = a.octaveDots * 10 + parseInt(a.pitch);
                    const bV = b.octaveDots * 10 + parseInt(b.pitch);
                    return bV - aV;
                  });
                  return (
                    <span key={ni} className={diffStyles.jpChordWrap} style={{ minWidth: `${layouts[ni].w}px` }}>
                      <span className={diffStyles.jpChordStack}>
                        {sorted.map((cn, ci) => (
                          <span key={ci} className={diffStyles.jpChordNote}>
                            {cn.accidental === '#' && <span className={diffStyles.jpChordAcc}>#</span>}
                            {cn.accidental === 'b' && <span className={diffStyles.jpChordAcc}>b</span>}
                            {cn.pitch}
                            {cn.octaveDots > 0 && <sup className={diffStyles.jpChordOctave}>{'˙'.repeat(cn.octaveDots)}</sup>}
                            {cn.octaveDots < 0 && <sub className={diffStyles.jpChordOctave}>{'˙'.repeat(Math.abs(cn.octaveDots))}</sub>}
                          </span>
                        ))}
                      </span>
                    </span>
                  );
                }

                let txt = '';
                if (n.accidental === '#') txt += '#';
                else if (n.accidental === 'b') txt += 'b';
                txt += n.pitch;

                return (
                  <span key={ni} className={diffStyles.jpNoteWrap} style={{ minWidth: `${layouts[ni].w}px` }}>
                    {/* 高音点：在音符上方留出空间 */}
                    {n.octaveDots > 0 && (
                      <span className={diffStyles.jpOctaveBlock}>
                        <span className={diffStyles.jpOctaveDots}>{'˙'.repeat(n.octaveDots)}</span>
                      </span>
                    )}
                    {/* 低音点：在音符下方留出空间 */}
                    {n.octaveDots < 0 && (
                      <span className={diffStyles.jpOctaveBlockLow}>
                        <span className={diffStyles.jpOctaveDots}>{'˙'.repeat(-n.octaveDots)}</span>
                      </span>
                    )}
                    <span className={`${diffStyles.jpNote} ${n.octaveDots > 0 ? diffStyles.jpHigh : ''} ${n.octaveDots >= 2 ? diffStyles.jpDHigh : ''} ${n.octaveDots < 0 ? diffStyles.jpLow : ''}`}>
                      {txt}
                    </span>
                    {n.isStaccato && <span className={diffStyles.jpStacc}> </span>}
                    {n.isAccent && <span className={diffStyles.jpAccent}>{'>'}</span>}
                    {n.isTenuto && <span className={diffStyles.jpTenuto}>—</span>}
                    {n.isDot && <span className={diffStyles.jpDotMark}>•</span>}
                    {n.fermata && <span className={diffStyles.jpFermata}>𝅭</span>}
                    {n.dynamics && <sup className={diffStyles.jpDyn}>{n.dynamics}</sup>}
                  </span>
                );
              })}
            </span>

            {/* 连音弧线 SVG — 覆盖在音符上方 */}
            {ties.length > 0 && (
              <svg className={diffStyles.jpTieOverlay} width={measW} height={measH} viewBox={`0 0 ${measW} ${measH}`} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}>
                {ties.map((t, tieIdx) => {
                  // 弧高与距离成正比，让短弧够高、长弧平滑
                  const arcH = Math.max(12, Math.min(22, t.dist / 3.5));
                  const cy = 14 + arcH;       // 控制点 Y（弧顶），越低弧越弯
                  const ey = cy + 2;           // 端点 Y
                  return (
                    <path key={tieIdx} d={`M ${t.fromX + 2} ${ey} Q ${(t.fromX + t.toX) / 2} ${cy - arcH} ${t.toX - 2} ${ey}`}
                      stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
                  );
                })}
              </svg>
            )}

            {/* 跨小节连线 */}
            {m.hasTieStart && <span className={diffStyles.jpCrossTie}>⌒</span>}
            <span className={diffStyles.diffJianpuBar}>|</span>
          </span>
        );
      })}
    </div>
  );
}

type PageMode = 'list' | 'diff' | 'content';

export function DiffPage() {
  const scoresAPI = useScoresStore();
  const branchesAPI = useBranchesStore();
  const sectionsAPI = useSectionsStore();

  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showStaff, setShowStaff] = useState(false);
  const [mode, setMode] = useState<PageMode>('list');
  const [mergeResult, setMergeResult] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
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

  const loadConflicts = useCallback(async (branchId: number) => {
    setConflictsLoading(true);
    try {
      const data = await mergeApi.getConflicts(branchId);
      setConflicts(data.conflicts);
    } catch {} finally {
      setConflictsLoading(false);
    }
  }, []);

  // 切换分支时加载 diff + 冲突
  useEffect(() => {
    if (selectedBranchId && selectedBranchId !== prevBranchRef.current) {
      prevBranchRef.current = selectedBranchId;
      setMergeResult(null);
      setConflicts([]);
      branchesAPI.fetchDiff(selectedBranchId);
      loadConflicts(selectedBranchId);
    }
  }, [selectedBranchId, loadConflicts]);

  const selectedBranch = branchesAPI.list.data.find((b) => b.id === selectedBranchId);
  const isMerged = selectedBranch?.status === 'merged';
  const activeBranches = branchesAPI.list.data.filter((b) => b.status === 'active');
  const mergedBranches = branchesAPI.list.data.filter((b) => b.status === 'merged');

  // 合并
  const handleMerge = async () => {
    if (!selectedBranchId || isMerged) return;
    setMerging(true);
    try {
      await branchesAPI.mergeBranch(selectedBranchId, 1);
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
          <Button variant="ghost" size="md" onClick={() => setShowStaff(!showStaff)}>
            {showStaff ? '♩ 简谱' : '𝄞 五线谱'}
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
                        {conflicts.filter(c => c.section_id === d.sectionId).length > 0 && (
                          <Badge variant="danger" label="⚡ 冲突" />
                        )}
                      </div>
                      <div className={styles.diffRowContent}>
                        {d.type === 'modified' ? (
                          <div className={styles.diffNotationCompare}>
                            <div className={styles.diffNotationPanel + ' ' + styles.diffOldPanel}>
                              <div className={styles.diffNotationLabel}>主库 · {d.oldName || '原内容'}</div>
                              {showStaff ? (
                                <VexflowStaff parsed={parseJianpu(d.oldContent)} />
                              ) : (
                                <JianpuMini content={d.oldContent} />
                              )}
                            </div>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.diffArrow}><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            <div className={styles.diffNotationPanel + ' ' + styles.diffNewPanel}>
                              <div className={styles.diffNotationLabel}>分支 · {d.sectionName}</div>
                              {showStaff ? (
                                <VexflowStaff parsed={parseJianpu(d.content)} />
                              ) : (
                                <JianpuMini content={d.content} />
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className={styles.diffNewPanel}>
                            <JianpuMini content={d.content} />
                          </div>
                        )}
                      </div>
                      {/* 冲突卡片 */}
                      {conflicts.filter(c => c.section_id === d.sectionId).map((c) => (
                        <ConflictCard key={c.id} conflict={c} onResolved={() => loadConflicts(selectedBranchId!)} />
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {conflictsLoading && <Loading size="sm" text="检测冲突…" />}

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
