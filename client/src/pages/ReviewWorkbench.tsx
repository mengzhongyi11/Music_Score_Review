import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FileTree } from '@/components/shared/FileTree';
import { StaffView } from '@/components/notation/StaffView';
import { VersionTimeline } from '@/components/review/VersionTimeline';
import { Badge } from '@/components/shared/Badge';
import { Button } from '@/components/shared/Button';
import { Loading, ErrorMessage, EmptyState } from '@/components/shared/Loading';
import { useSidebarStore, useReviewStore } from '@/store';
import { useScoresStore as useScoresAPI, useCommentsStore as useCommentsAPI, useSectionsStore as useSectionsAPI, useBranchesStore } from '@/api/apiStore';
import type { SectionRow } from '@/api';
import styles from './ReviewWorkbench.module.css';

export function ReviewWorkbench() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeFilter } = useSidebarStore();
  const { resolveAnnotation } = useReviewStore();
  const scoresAPI = useScoresAPI();
  const commentsAPI = useCommentsAPI();
  const sectionsAPI = useSectionsAPI();
  const branchesAPI = useBranchesStore();

  // 从 URL 参数读取 scoreId
  const urlScoreId = searchParams.get('scoreId');
  const [selectedScoreId, setSelectedScoreId] = useState<number>(urlScoreId ? Number(urlScoreId) : 1);
  const [selectedSection, setSelectedSection] = useState<SectionRow | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [activePanel, setActivePanel] = useState<'comments' | 'tree'>('tree');

  // 分支管理
  const [showBranchPanel, setShowBranchPanel] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  // 提交审阅
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  // 过滤逻辑
  const getScoreColumn = (id: number): string => {
    return ['pending', 'reviewing', 'approved', 'rejected'][id % 4];
  };
  const filteredScores = scoresAPI.list.data.filter((s) => {
    if (activeFilter === 'all') return true;
    return getScoreColumn(s.id) === activeFilter;
  });

  useEffect(() => {
    if (filteredScores.length > 0 && !filteredScores.find((s) => s.id === selectedScoreId)) {
      setSelectedScoreId(filteredScores[0].id);
    }
  }, [activeFilter, filteredScores.length]);

  // 加载数据
  useEffect(() => {
    scoresAPI.fetchList();
  }, []);

  useEffect(() => {
    if (selectedScoreId) {
      sectionsAPI.fetchTree(selectedScoreId);
      branchesAPI.fetchByScore(selectedScoreId);
    }
  }, [selectedScoreId]);

  useEffect(() => {
    if (selectedSection) {
      commentsAPI.fetchBySection(selectedSection.id);
    }
  }, [selectedSection?.id]);

  useEffect(() => {
    const firstSection = sectionsAPI.tree.data.find((s) => s.type === 'section');
    if (firstSection && !selectedSection) {
      setSelectedSection(firstSection);
    }
  }, [sectionsAPI.tree.data]);

  // 提交批注
  const handleSubmitComment = useCallback(async () => {
    if (!commentInput.trim() || !selectedSection) return;
    try {
      await commentsAPI.createComment({
        section_id: selectedSection.id,
        user_id: 1,
        content: commentInput.trim(),
        measure_ref: `第${Math.floor(Math.random() * 32) + 1}小节`,
      });
      setCommentInput('');
    } catch (err: any) {
      alert('提交失败: ' + err.message);
    }
  }, [commentInput, selectedSection]);

  // 解决批注
  const handleResolve = async (id: number) => {
    try {
      await commentsAPI.resolveComment(id);
      resolveAnnotation(String(id));
    } catch (err: any) {
      alert('操作失败: ' + err.message);
    }
  };

  // 创建分支
  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;
    try {
      await branchesAPI.createBranch({
        score_id: selectedScoreId,
        name: newBranchName.trim(),
        created_by: 1,
      });
      setNewBranchName('');
      setShowBranchPanel(false);
    } catch (err: any) {
      alert('创建分支失败: ' + err.message);
    }
  };

  // 提交审阅
  const handleSubmitReview = async () => {
    try {
      // 模拟创建版本
      const section = selectedSection;
      if (section) {
        await sectionsAPI.updateSection(section.id, {
          content: section.content || undefined,
        });
      }
      setShowSubmitDialog(false);
      alert('♩ 审阅已提交！' + (submitMessage ? ` 备注：${submitMessage}` : ''));
      setSubmitMessage('');
    } catch (err: any) {
      alert('提交失败: ' + err.message);
    }
  };

  // 导出 PDF


  const scores = filteredScores;
  const comments = commentsAPI.list.data;
  const currentScore = scoresAPI.list.data.find((s) => s.id === selectedScoreId);
  const openComments = comments.filter((c) => c.status === 'open');
  const resolvedComments = comments.filter((c) => c.status === 'resolved');

  if (scoresAPI.list.loading && scores.length === 0) return <Loading text="加载乐谱数据…" />;
  if (scoresAPI.list.error) return <ErrorMessage message={scoresAPI.list.error} onRetry={() => scoresAPI.fetchList()} />;

  return (
    <div className={styles.page}>
      {/* 页面头部 */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>审阅工作台</h1>
          <div className={styles.subtitle}>
            <Badge variant={activeFilter === 'all' ? 'default' : activeFilter} />
            <span className={styles.separator}>/</span>
            <select className={styles.scoreSelect} value={selectedScoreId} onChange={(e) => {
              const id = Number(e.target.value);
              setSelectedScoreId(id);
              setSelectedSection(null);
              navigate(`/review?scoreId=${id}`, { replace: true });
            }}>
              {filteredScores.length === 0 && <option value={0}>无匹配结果</option>}
              {filteredScores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <span className={styles.separator}>/</span>
            <span className={styles.scoreName}>{selectedSection?.name || '选择乐段'}</span>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.shareBtn} onClick={() => navigate(`/full-score/${selectedScoreId}`)}>
            🎼 完整乐谱
          </button>
          <button className={styles.shareBtn} onClick={() => setShowBranchPanel(!showBranchPanel)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3v10M3 3l10 5-10 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            分支 ({branchesAPI.list.data.filter((b) => b.status === 'active').length})
          </button>
          <button className={styles.shareBtn} onClick={() => navigate(`/settings/${selectedScoreId}`)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.5 3.5l1.5 1.5M11 11l1.5 1.5M3.5 12.5L5 11M11 5l1.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            设置
          </button>
          <button className={styles.submitBtn} onClick={() => setShowSubmitDialog(true)}>提交审阅</button>
        </div>
      </div>

      {/* 分支面板：每个分支是主库的独立副本 */}
      {showBranchPanel && (
        <div className={styles.branchPanel}>
          <div className={styles.branchPanelInner}>
            <div className={styles.branchPanelHeader}>
              <span className={styles.branchPanelTitle}>🎵 分支（独立乐谱库）</span>
              <button className={styles.branchManageBtn} onClick={() => navigate('/diff')}>
                管理全部 →
              </button>
            </div>
            <p className={styles.branchPanelDesc}>
              分支是从主库复制出来的独立乐谱库，你可以在分支上自由修改，完成后合并回主库。
            </p>
            <div className={styles.branchList}>
              {branchesAPI.list.data.map((b) => (
                <div key={b.id} className={styles.branchItem}>
                  <span className={styles.branchDot} data-status={b.status} />
                  <span className={styles.branchName}>{b.name}</span>
                  <Badge variant={b.status === 'active' ? 'reviewing' : b.status === 'merged' ? 'success' : 'default'} label={{ active: '活跃', merged: '已合并', closed: '已关闭' }[b.status] || b.status} />
                  <span className={styles.branchCreator}>{b.created_by_name || '—'}</span>
                </div>
              ))}
              {branchesAPI.list.data.length === 0 && <span className={styles.emptyText}>暂无分支</span>}
            </div>
            <div className={styles.branchCreate}>
              <input
                className={styles.branchInput}
                placeholder="新分支名称（如：张三-力度修改）..."
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
              />
              <Button variant="primary" size="sm" onClick={handleCreateBranch} disabled={!newBranchName.trim()}>
                创建副本
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <div className={styles.workbench}>
        {/* 左侧面板 */}
        <div className={styles.sidePanel}>
          <div className={styles.panelTabs}>
            <button className={`${styles.panelTab} ${activePanel === 'tree' ? styles.panelTabActive : ''}`} onClick={() => setActivePanel('tree')}>🎼 结构</button>
            <button className={`${styles.panelTab} ${activePanel === 'comments' ? styles.panelTabActive : ''}`} onClick={() => setActivePanel('comments')}>🎵 批注 ({comments.length})</button>
          </div>

          {activePanel === 'tree' && (
            <div className={styles.panelContent}>
              <FileTree scoreId={selectedScoreId} selectedSectionId={selectedSection?.id || null} onSelect={setSelectedSection} />
            </div>
          )}

          {activePanel === 'comments' && (
            <div className={styles.panelContent}>
              <div className={styles.summaryBar}>
                <div className={styles.summaryItem}><span className={styles.summaryValue} style={{ color: 'var(--color-warning-text)' }}>{openComments.length}</span><span className={styles.summaryLabel}>待回复</span></div>
                <div className={styles.summaryItem}><span className={styles.summaryValue} style={{ color: 'var(--color-success-text)' }}>{resolvedComments.length}</span><span className={styles.summaryLabel}>已解决</span></div>
                <div className={styles.summaryItem}><span className={styles.summaryValue} style={{ color: '#58A6FF' }}>{comments.length}</span><span className={styles.summaryLabel}>总计</span></div>
              </div>

              <div className={styles.hintBar}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/><path d="M7 4v4M7 10v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                点击乐谱上的小节添加批注
              </div>

              <div className={styles.annotationList}>
                {commentsAPI.list.loading && <Loading size="sm" text="加载批注…" />}
                {commentsAPI.list.error && <ErrorMessage message={commentsAPI.list.error} />}
                {!commentsAPI.list.loading && !commentsAPI.list.error && comments.length === 0 && (
                  <EmptyState icon="🎵" title="暂无批注" description="点击乐谱上的小节添加批注" />
                )}
                {comments.map((c) => (
                  <div key={c.id} className={styles.annotationItem}>
                    <div className={styles.aiHeader}>
                      <span className={styles.aiAuthor}><span className={styles.aiAvatar}>{c.author[0]}</span>{c.author}</span>
                      <Badge variant={c.status === 'open' ? 'awaiting_reply' : 'resolved'} />
                    </div>
                    <p className={styles.aiContent}>{c.content}</p>
                    <div className={styles.aiFooter}>
                      <span>{c.measure_ref || ''}{c.measure_ref && ' · '}{new Date(c.created_at).toLocaleDateString('zh-CN')}</span>
                      {c.status === 'open' && <button className={styles.resolveLink} onClick={() => handleResolve(c.id)}>标记解决</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右侧主区域 */}
        <div className={styles.mainArea}>
          <div className={styles.scoreMetaBar}>
            <div className={styles.metaLeft}>
              <div className={styles.metaItem}><span className={styles.metaIcon}>𝄞</span><span>{selectedSection?.key_signature || '—'}</span></div>
              <div className={styles.metaDivider} />
              <div className={styles.metaItem}><span className={styles.metaIcon}>{selectedSection?.time_signature || '—'}</span><span>{selectedSection?.time_signature || '—'} 拍</span></div>
              <div className={styles.metaDivider} />
              <div className={styles.metaItem}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/><path d="M8 4v4l3 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>{selectedSection?.tempo || '—'}</div>
              <div className={styles.metaDivider} />
              <div className={styles.metaItem}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg><span>作曲: {currentScore?.composer || '—'}</span></div>
            </div>
            <div className={styles.metaRight}>
              <div className={styles.progressStat}>
                <span className={styles.progressLabel} style={{ color: 'var(--color-success-text)' }}>解决率 {comments.length > 0 ? Math.round((resolvedComments.length / comments.length) * 100) : 0}%</span>
                <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${comments.length > 0 ? Math.round((resolvedComments.length / comments.length) * 100) : 0}%` }} /></div>
              </div>
            </div>
          </div>
          <StaffView
            section={selectedSection}
            comments={comments}
            onAddComment={async (measure, content) => {
              if (selectedSection) {
                await commentsAPI.createComment({
                  section_id: selectedSection.id,
                  user_id: 1,
                  content,
                  measure_ref: `第${measure}小节`,
                });
              }
            }}
            onResolveComment={async (id) => {
              await commentsAPI.resolveComment(id);
            }}
          />
          <VersionTimeline sectionId={selectedSection?.id} />
        </div>
      </div>

      {/* 提交审阅对话框 */}
      {showSubmitDialog && (
        <div className={styles.overlay} onClick={() => setShowSubmitDialog(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.dialogTitle}>♩ 提交审阅</h3>
            <p className={styles.dialogDesc}>
              将当前乐谱「{currentScore?.name || ''}」的审阅结果提交。这将会创建一个新版本。
            </p>
            <textarea
              className={styles.dialogInput}
              placeholder="添加审阅备注（可选）..."
              value={submitMessage}
              onChange={(e) => setSubmitMessage(e.target.value)}
              rows={3}
            />
            <div className={styles.dialogActions}>
              <Button variant="secondary" size="md" onClick={() => setShowSubmitDialog(false)}>取消</Button>
              <Button variant="primary" size="md" onClick={handleSubmitReview}>确认提交</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
