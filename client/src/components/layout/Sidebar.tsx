import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSidebarStore } from '@/store';
import { useScoresStore, useCommentsStore, useUsersStore, useDashboardStore } from '@/api/apiStore';
import { collaboratorsApi } from '@/api';
import styles from './Sidebar.module.css';

export type FilterValue = 'all' | 'pending' | 'working' | 'approved' | 'rejected';

const filterConfig = [
  { value: 'pending' as FilterValue,   label: '待审阅', color: 'var(--color-warning)' },
  { value: 'approved' as FilterValue,  label: '已通过',  color: 'var(--color-success-text)' },
  { value: 'working' as FilterValue,   label: '工作中',  color: '#58A6FF' },
  { value: 'rejected' as FilterValue,  label: '已驳回',  color: 'var(--color-danger-text)' },
];

export function Sidebar() {
  const { collapsed, activeFilter, setActiveFilter } = useSidebarStore();
  const navigate = useNavigate();
  const scoresAPI = useScoresStore();
  const commentsAPI = useCommentsStore();
  const usersAPI = useUsersStore();
  const dashboardAPI = useDashboardStore();

  // 时间范围筛选
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('all');
  const [selectedProjects, setSelectedProjects] = useState<Set<number>>(new Set());

  // 首次加载数据
  // 协作者列表状态
  const [collaborators, setCollaborators] = useState<any[]>([]);

  useEffect(() => {
    scoresAPI.fetchList();
    usersAPI.fetchList();
    dashboardAPI.fetchStats();
  }, []);

  // 当乐谱加载完成后，获取第一个乐谱的协作者
  useEffect(() => {
    if (scoresAPI.list.data.length > 0) {
      const firstScoreId = scoresAPI.list.data[0].id;
      collaboratorsApi.getByScore(firstScoreId)
        .then(setCollaborators)
        .catch(() => {});
    }
  }, [scoresAPI.list.data]);

  // 按审阅状态分配
  const getStatus = (s: any): FilterValue => {
    const st = s.review_status || 'approved';
    return (['pending', 'working', 'approved', 'rejected'].includes(st) ? st : 'approved') as FilterValue;
  };

  // 筛选计数
  const totalScores = scoresAPI.list.data.length;
  const pendingCount = scoresAPI.list.data.filter((s) => getStatus(s) === 'pending').length;
  const workingCount = scoresAPI.list.data.filter((s) => getStatus(s) === 'working').length;
  const approvedCount = scoresAPI.list.data.filter((s) => getStatus(s) === 'approved').length;
  const rejectedCount = scoresAPI.list.data.filter((s) => getStatus(s) === 'rejected').length;

  const filterCounts: Record<FilterValue, number> = {
    all: totalScores,
    pending: pendingCount,
    working: workingCount,
    approved: approvedCount,
    rejected: rejectedCount,
  };

  // 项目列表（从 API 获取的乐谱）
  const projects = scoresAPI.list.data
    .filter((s) => s.owner_name)
    .map((s) => ({ id: s.id, name: s.name, composer: s.composer, owner: s.owner_name || '' }))
    .slice(0, 12);

  // 切换项目选择
  const toggleProject = (id: number) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 处理筛选点击
  const handleFilterClick = (value: FilterValue) => {
    setActiveFilter(value);
  };

  // 处理时间范围
  const handleDateRange = (range: '7d' | '30d' | '90d' | 'all') => {
    setDateRange(range);
  };

  // 折叠态——只显示筛选图标
  if (collapsed) {
    return (
      <aside className={`${styles.sidebar} ${styles.collapsed}`}>
        {filterConfig.map((f) => (
          <button
            key={f.value}
            className={`${styles.filterIcon} ${activeFilter === f.value ? styles.activeIcon : ''}`}
            onClick={() => handleFilterClick(f.value)}
            title={`${f.label} (${filterCounts[f.value]})`}
          >
            <span className={styles.filterDot} style={{ background: f.color }} />
            {filterCounts[f.value] > 0 && (
              <span className={styles.filterBadge}>{filterCounts[f.value]}</span>
            )}
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside className={styles.sidebar}>
      {/* ── 审阅状态 ── */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>审阅状态</h3>
        <div className={styles.filterList}>
          <button
            className={`${styles.filterItem} ${activeFilter === 'all' ? styles.active : ''}`}
            onClick={() => handleFilterClick('all')}
          >
            <span className={styles.filterDotAll}>○</span>
            <span>全部乐谱</span>
            <span className={styles.count}>{totalScores}</span>
          </button>
          {filterConfig.map((f) => (
            <button
              key={f.value}
              className={`${styles.filterItem} ${activeFilter === f.value ? styles.active : ''}`}
              onClick={() => handleFilterClick(f.value)}
            >
              <span className={styles.filterDot} style={{ background: f.color }} />
              <span>{f.label}</span>
              <span className={styles.count}>{filterCounts[f.value]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.divider} />

      {/* ── 我的乐谱库 ── */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>🎼 我的乐谱库</h3>
        <div className={styles.projectList}>
          {projects.length === 0 && (
            <span className={styles.emptyText}>暂无乐谱</span>
          )}
          {projects.map((p) => (
            <div
              key={p.id}
              className={styles.projectItem}
              onClick={() => navigate(`/review?scoreId=${p.id}`)}
            >
              <span className={styles.projectIcon}>🎼</span>
              <div className={styles.projectInfo}>
                <span className={styles.projectName}>{p.name}</span>
                <span className={styles.projectComposer}>{p.composer} · {p.owner}</span>
              </div>
              <button
                className={styles.projectSettingsBtn}
                onClick={(e) => { e.stopPropagation(); navigate(`/settings/${p.id}`); }}
                title="设置"
              >
                🎛️
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.divider} />

      {/* ── 日期范围 ── */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>日期范围</h3>
        <div className={styles.datePresets}>
          {(['7d', '30d', '90d', 'all'] as const).map((d) => (
            <button
              key={d}
              className={`${styles.dateBtn} ${dateRange === d ? styles.dateActive : ''}`}
              onClick={() => handleDateRange(d)}
            >
              {{ '7d': '近7天', '30d': '近30天', '90d': '近90天', all: '全部' }[d]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.divider} />

      {/* ── 协作者列表（参与当前乐谱修改的人） ── */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>
          协作者
          <span className={styles.count} style={{ marginLeft: 'auto' }}>
            {collaborators.length + 1}
          </span>
        </h3>
        <div className={styles.userList}>
          {scoresAPI.list.data[0] && (
            <div className={styles.userItem}>
              <span className={styles.userDot} style={{ background: '#58A6FF' }} />
              <span className={styles.userName}>
                {scoresAPI.list.data[0].owner_name || '所有者'}
              </span>
              <span className={styles.userStatus}>所有者</span>
            </div>
          )}
          {collaborators.map((c) => (
            <div key={c.id} className={styles.userItem}>
              <span
                className={styles.userDot}
                style={{ background: c.role === 'reviewer' ? '#3FB950' : '#8B949E' }}
              />
              <span className={styles.userName}>{c.name}</span>
              <span className={styles.userStatus}>
                {c.role === 'reviewer' ? '审阅人' : '贡献者'}
              </span>
            </div>
          ))}
          {collaborators.length === 0 && (
            <span className={styles.emptyText}>暂无协作者</span>
          )}
        </div>
      </div>

      {/* ── 底部统计 ── */}
      <div className={styles.divider} />
      <div className={styles.section}>
        <div className={styles.statsRow}>
          {!dashboardAPI.stats.loading && dashboardAPI.stats.data && (
            <>
              <div className={styles.statChip}>
                <span className={styles.statVal}>{dashboardAPI.stats.data.myScores}</span>
                <span className={styles.statLbl}>乐谱</span>
              </div>
              <div className={styles.statChip}>
                <span className={styles.statVal}>{dashboardAPI.stats.data.pendingReviews}</span>
                <span className={styles.statLbl}>待处理</span>
              </div>
              <div className={styles.statChip}>
                <span className={styles.statVal}>{dashboardAPI.stats.data.todayEdits}</span>
                <span className={styles.statLbl}>今日修改</span>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
