import styles from './PriorityBadge.module.css';

interface Props {
  priority: 'P0' | 'P1' | 'P2';
}

const priorityConfig = {
  P0: { label: 'P0 紧急', color: '#cf222e', bg: '#FFebe9' },
  P1: { label: 'P1 建议', color: '#d4920b', bg: '#fff8c5' },
  P2: { label: 'P2 可忽略', color: '#1a7f37', bg: '#dafbe1' },
};

export function PriorityBadge({ priority }: Props) {
  const cfg = priorityConfig[priority];
  return (
    <span
      className={styles.badge}
      style={{ color: cfg.color, backgroundColor: cfg.bg, borderColor: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}
