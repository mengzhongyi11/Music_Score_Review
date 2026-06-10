import type { Annotation } from '@/types';
import { Badge } from '@/components/shared/Badge';
import styles from './AnnotationBubble.module.css';

interface AnnotationBubbleProps {
  annotation: Annotation;
  onResolve?: (id: string) => void;
}

export function AnnotationBubble({ annotation, onResolve }: AnnotationBubbleProps) {
  const { id, author, content, status, createdAt, position, replies } = annotation;

  return (
    <div
      className={styles.bubble}
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
    >
      <div className={styles.arrow} />
      <div className={styles.header}>
        <div className={styles.authorInfo}>
          <div className={styles.avatar}>{author.name[0]}</div>
          <div>
            <span className={styles.authorName}>{author.name}</span>
            <span className={styles.time}>
              {new Date(createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
        <Badge variant={status} />
      </div>
      <div className={styles.body}>
        <p className={styles.content}>{content}</p>
      </div>
      {replies.length > 0 && (
        <div className={styles.replies}>
          {replies.map((r) => (
            <div key={r.id} className={styles.reply}>
              <span className={styles.replyAuthor}>{r.author.name}</span>
              <span className={styles.replyText}>{r.content}</span>
            </div>
          ))}
        </div>
      )}
      <div className={styles.footer}>
        <div className={styles.reactions}>
          <button className={styles.reactionBtn} title="表情反应">🎵</button>
          <button className={styles.reactionBtn} title="语音批注">🎤</button>
          <button className={styles.reactionBtn} title="音符反应">🎶</button>
        </div>
        <div className={styles.actions}>
          <button className={styles.actionBtn}>回复</button>
          {status !== 'resolved' && onResolve && (
            <button className={styles.resolveBtn} onClick={() => onResolve(id)}>
              解决
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
