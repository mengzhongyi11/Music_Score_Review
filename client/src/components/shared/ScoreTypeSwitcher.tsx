import { useReviewStore } from '@/store';
import styles from './ScoreTypeSwitcher.module.css';

export function ScoreTypeSwitcher() {
  const { scoreType, setScoreType } = useReviewStore();

  return (
    <div className={styles.switcher}>
      <button
        className={`${styles.tab} ${scoreType === 'staff' ? styles.active : ''}`}
        onClick={() => setScoreType('staff')}
      >
        五线谱
      </button>
      <button
        className={`${styles.tab} ${scoreType === 'jianpu' ? styles.active : ''}`}
        onClick={() => setScoreType('jianpu')}
      >
        简谱
      </button>
      <div className={`${styles.indicator} ${scoreType === 'staff' ? styles.left : styles.right}`} />
    </div>
  );
}
