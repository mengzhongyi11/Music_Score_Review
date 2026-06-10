import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/shared/Badge';
import { Button } from '@/components/shared/Button';
import { Loading, ErrorMessage, EmptyState } from '@/components/shared/Loading';
import { CreateScoreModal } from '@/components/shared/CreateScoreModal';
import { useScoresStore, useDashboardStore } from '@/api/apiStore';
import type { ScoreRow } from '@/api';
import type { ReviewStatus } from '@/types';
import styles from './ProjectKanban.module.css';

/* 定义阶段对应的状态 */
type ColumnKey = 'pending' | 'reviewing' | 'approved' | 'rejected';

const columns: { key: ColumnKey; label: string; color: string }[] = [
  { key: 'pending',   label: '待审阅', color: 'var(--color-warning)' },
  { key: 'reviewing', label: '审阅中', color: '#58A6FF' },
  { key: 'approved',  label: '已通过', color: 'var(--color-success-text)' },
  { key: 'rejected',  label: '已驳回', color: 'var(--color-danger-text)' },
];

/* 把乐谱按 ID 哈希分配到不同列（稳定分配） */
function getColumnForScore(id: number): ColumnKey {
  const idx = id % 4;
  return columns[idx].key;
}

/* 更新乐谱所在的列（用 localStorage 持久化用户的手动调整） */
function loadOverrides(): Record<number, ColumnKey> {
  try {
    return JSON.parse(localStorage.getItem('kanban_overrides') || '{}');
  } catch { return {}; }
}
function saveOverride(scoreId: number, col: ColumnKey) {
  const overrides = loadOverrides();
  overrides[scoreId] = col;
  localStorage.setItem('kanban_overrides', JSON.stringify(overrides));
}

export function ProjectKanban() {
  const navigate = useNavigate();
  const scoresAPI = useScoresStore();
  const { stats, fetchStats } = useDashboardStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [localColumns, setLocalColumns] = useState<Record<ColumnKey, ScoreRow[]>>({
    pending: [], reviewing: [], approved: [], rejected: [],
  });
  const [dragOverCol, setDragOverCol] = useState<ColumnKey | null>(null);

  // 首次加载
  useEffect(() => {
    scoresAPI.fetchList();
    fetchStats();
  }, []);

  // 当 scores 数据变化时，分配到列
  useEffect(() => {
    const overrides = loadOverrides();
    const cols: Record<ColumnKey, ScoreRow[]> = {
      pending: [], reviewing: [], approved: [], rejected: [],
    };
    scoresAPI.list.data.forEach((s) => {
      const col = overrides[s.id] || getColumnForScore(s.id);
      cols[col].push(s);
    });
    setLocalColumns(cols);
  }, [scoresAPI.list.data]);

  // 搜索过滤
  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val.trim()) {
      scoresAPI.searchScores(val.trim());
    } else {
      scoresAPI.fetchList();
    }
  }, []);

  // 拖拽处理
  const handleDragStart = (e: React.DragEvent, scoreId: number, fromCol: ColumnKey) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ scoreId, fromCol }));
    (e.currentTarget as HTMLElement).style.opacity = '0.5';
  };
  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = '1';
  };
  const handleDragOver = (e: React.DragEvent, col: ColumnKey) => {
    e.preventDefault();
    setDragOverCol(col);
  };
  const handleDragLeave = () => setDragOverCol(null);
  const handleDrop = (e: React.DragEvent, toCol: ColumnKey) => {
    e.preventDefault();
    setDragOverCol(null);
    try {
      const { scoreId, fromCol } = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (fromCol === toCol) return;
      // 从原列移除
      const fromScores = [...localColumns[fromCol as ColumnKey]];
      const movedScore = fromScores.find((s) => s.id === scoreId);
      if (!movedScore) return;
      saveOverride(scoreId, toCol);
      setLocalColumns((prev) => ({
        ...prev,
        [fromCol]: prev[fromCol as ColumnKey].filter((s) => s.id !== scoreId),
        [toCol]: [...prev[toCol], movedScore],
      }));
    } catch {}
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

      {/* Kanban 列 */}
      {!isLoading && !scoresAPI.list.error && (
        <div className={styles.kanban}>
          {columns.map((col) => {
            const cards = localColumns[col.key] || [];
            return (
              <div
                key={col.key}
                className={`${styles.column} ${dragOverCol === col.key ? styles.columnDragOver : ''}`}
                onDragOver={(e) => handleDragOver(e, col.key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.key)}
              >
                <div className={styles.columnHeader}>
                  <span className={styles.columnDot} style={{ background: col.color }} />
                  <span className={styles.columnTitle}>{col.label}</span>
                  <span className={styles.columnCount}>{cards.length}</span>
                </div>
                <div className={styles.cardList}>
                  {cards.map((score) => (
                    <div
                      key={score.id}
                      className={styles.card}
                      draggable
                      onDragStart={(e) => handleDragStart(e, score.id, col.key)}
                      onDragEnd={handleDragEnd}
                      onClick={() => navigate(`/review?scoreId=${score.id}`)}
                    >
                      <div className={styles.cardThumb}>
                        <span className={styles.thumbIcon}>𝄞</span>
                      </div>
                      <div className={styles.cardBody}>
                        <h3 className={styles.cardTitle}>{score.name}</h3>
                        <div className={styles.cardMeta}>
                          <span>{score.owner_name || score.composer}</span>
                          <span className={styles.metaDot}>·</span>
                          <span>{new Date(score.updated_at).toLocaleDateString('zh-CN')}</span>
                        </div>
                        <div className={styles.cardFooter}>
                          <span className={styles.annotationBadge}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2.5a.5.5 0 01.5-.5h7a.5.5 0 01.5.5v5a.5.5 0 01-.5.5H6l-2 2v-2H2.5a.5.5 0 01-.5-.5v-5z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/></svg>
                            {score.description ? score.description.length % 10 : 0}
                          </span>
                          <Badge variant={getColumnForScore(score.id) as ReviewStatus} />
                          <button
                            className={styles.cardSettingsBtn}
                            onClick={(e) => { e.stopPropagation(); navigate(`/settings/${score.id}`); }}
                            title="设置"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.5 2.5l1.5 1.5M10 10l1.5 1.5M2.5 11.5L4 10M10 4l1.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <div className={styles.emptyColumn}>
                      <span className={styles.emptyText}>拖拽乐谱到此处</span>
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
    </div>
  );
}
