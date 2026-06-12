import type { ReviewStatus, AnnotationStatus } from '@/types';
import styles from './Badge.module.css';

type BadgeVariant = ReviewStatus | AnnotationStatus | 'default' | 'info' | 'warning' | 'success' | 'danger';

const variantMap: Record<string, { className: string; label: string }> = {
  pending:    { className: 'badgeWarning', label: '待审阅' },
  working:    { className: 'badgeInfo',    label: '工作中' },
  approved:   { className: 'badgeSuccess', label: '已通过' },
  rejected:   { className: 'badgeDanger',  label: '已驳回' },
  awaiting_reply: { className: 'badgeWarning', label: '待回复' },
  replied:    { className: 'badgeInfo',    label: '已回复' },
  resolved:   { className: 'badgeSuccess', label: '已解决' },
};

interface BadgeProps {
  variant: BadgeVariant;
  label?: string;
  dot?: boolean;
}

export function Badge({ variant, label, dot = false }: BadgeProps) {
  const config = variantMap[variant] || { className: 'badgeDefault', label: variant };

  return (
    <span className={`${styles.badge} ${styles[config.className] || styles.badgeDefault}`}>
      {dot && <span className={styles.dot} />}
      {label || config.label}
    </span>
  );
}
