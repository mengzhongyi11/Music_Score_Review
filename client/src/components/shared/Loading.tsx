import styles from './Loading.module.css';

interface LoadingProps {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Loading({ text = '加载中…', size = 'md' }: LoadingProps) {
  return (
    <div className={`${styles.wrapper} ${styles[size]}`}>
      <div className={styles.spinner} />
      <span className={styles.text}>{text}</span>
    </div>
  );
}

export function Skeleton({ width = '100%', height = 16, count = 1 }: { width?: string; height?: number; count?: number }) {
  return (
    <div className={styles.skeletonGroup}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.skeleton} style={{ width, height }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon = '🎼', title, description }: { icon?: string; title: string; description?: string }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>{icon}</span>
      <p className={styles.emptyTitle}>{title}</p>
      {description && <p className={styles.emptyDesc}>{description}</p>}
    </div>
  );
}

export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className={styles.error}>
      <span className={styles.errorIcon}>!</span>
      <p className={styles.errorText}>{message}</p>
      {onRetry && (
        <button className={styles.retryBtn} onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}
