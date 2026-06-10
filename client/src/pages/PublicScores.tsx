import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/shared/Badge';
import { Button } from '@/components/shared/Button';
import { Loading, ErrorMessage, EmptyState } from '@/components/shared/Loading';
import { useScoresStore, useUsersStore, useBranchesStore } from '@/api/apiStore';
import type { ScoreRow } from '@/api';
import styles from './PublicScores.module.css';

export function PublicScores() {
  const navigate = useNavigate();
  const scoresAPI = useScoresStore();
  const usersAPI = useUsersStore();
  const branchesAPI = useBranchesStore();
  const [forkingId, setForkingId] = useState<number | null>(null);

  useEffect(() => {
    scoresAPI.fetchList();
    usersAPI.fetchList();
  }, []);

  // 模拟：每个用户只能看到自己的乐谱
  const currentUserId = 1; // 当前用户
  const myScores = scoresAPI.list.data.filter((s) => s.owner_id === currentUserId);
  const publicScores = scoresAPI.list.data.filter((s) => s.owner_id !== currentUserId);

  // Fork 操作：为当前用户创建分支（即复制一份到自己的库）
  const handleFork = async (score: ScoreRow) => {
    setForkingId(score.id);
    try {
      const res = await scoresAPI.createScore({
        name: `${score.name} (Fork)`,
        composer: score.composer,
        description: score.description || `从 ${score.owner_name || '用户' + score.owner_id} 的乐谱 Fork`,
        owner_id: currentUserId,
      });
      alert(`♩ Fork 成功！已在你的乐谱库中创建「${score.name} (Fork)」`);
    } catch (err: any) {
      alert('Fork 失败: ' + err.message);
    } finally {
      setForkingId(null);
    }
  };

  const isLoading = scoresAPI.list.loading && scoresAPI.list.data.length === 0;

  return (
    <div className={styles.page}>
      {/* 头部 */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>🎶 公共乐谱库</h1>
          <p className={styles.subtitle}>
            所有用户共享的乐谱 · 共 {scoresAPI.list.data.length} 首
          </p>
        </div>
      </div>

      {/* 我的乐谱库 */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          🎼 我的乐谱库
          <span className={styles.sectionCount}>{myScores.length}</span>
        </h2>
        <div className={styles.scoreGrid}>
          {myScores.map((s) => (
            <div key={s.id} className={styles.scoreCard}>
              <div className={styles.cardCover}>
                <span className={styles.cardIcon}>🎼</span>
              </div>
              <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>{s.name}</h3>
                <p className={styles.cardComposer}>{s.composer}</p>
                <p className={styles.cardOwner}>{s.owner_name || '我'}</p>
              </div>
              <div className={styles.cardActions}>
                <Button variant="secondary" size="sm" onClick={() => navigate(`/review?scoreId=${s.id}`)}>
                  🎵 审阅
                </Button>
                <button className={styles.actionIcon} onClick={() => navigate(`/settings/${s.id}`)} title="设置">
                  🎛️
                </button>
              </div>
            </div>
          ))}
          {myScores.length === 0 && !isLoading && (
            <div className={styles.emptyCard}>
              <span>暂无乐谱</span>
              <Button variant="primary" size="sm" onClick={() => navigate('/projects')}>去创建</Button>
            </div>
          )}
        </div>
      </section>

      {/* 公共乐谱库 */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          🎶 公共乐谱（可 Fork）
          <span className={styles.sectionCount}>{publicScores.length}</span>
        </h2>
        {isLoading && <Loading text="加载公共乐谱…" />}
        {scoresAPI.list.error && <ErrorMessage message={scoresAPI.list.error} />}
        {!isLoading && !scoresAPI.list.error && (
          <div className={styles.scoreGrid}>
            {publicScores.map((s) => (
              <div key={s.id} className={styles.scoreCard}>
                <div className={styles.cardCover}>
                  <span className={styles.cardIcon}>🎶</span>
                  <span className={styles.cardSource}>公开</span>
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{s.name}</h3>
                  <p className={styles.cardComposer}>{s.composer}</p>
                  <p className={styles.cardOwner}>
                    <span className={styles.ownerDot} />
                    {s.owner_name || '未知用户'}
                  </p>
                </div>
                <div className={styles.cardActions}>
                  <Button variant="secondary" size="sm" onClick={() => navigate(`/review?scoreId=${s.id}`)}>
                    🎵 审阅
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleFork(s)}
                    loading={forkingId === s.id}
                    disabled={forkingId === s.id}
                  >
                    {forkingId === s.id ? 'Fork 中…' : '♬ Fork'}
                  </Button>
                </div>
              </div>
            ))}
            {publicScores.length === 0 && !isLoading && (
              <EmptyState icon="🎶" title="没有其他用户的乐谱" description="邀请更多用户加入协作" />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
