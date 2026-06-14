import { useState } from 'react';
import { Badge } from '@/components/shared/Badge';
import type { CommentRow } from '@/api';
import styles from './AnnotationModal.module.css';

interface AnnotationModalProps {
  measureNum: number;
  sectionName: string;
  comments: CommentRow[];
  onClose: () => void;
  onSubmit: (content: string) => Promise<void>;
  onResolve: (id: number) => Promise<void>;
}

export function AnnotationModal({
  measureNum,
  sectionName,
  comments,
  onClose,
  onSubmit,
  onResolve,
}: AnnotationModalProps) {
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(input.trim());
      setInput('');
    } catch (err: any) {
      setError(err.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.measureBadge}>第 {measureNum} 小节</span>
            <span className={styles.sectionName}>{sectionName}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* 批注列表 */}
        <div className={styles.commentList}>
          {comments.length === 0 && (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>🎵</span>
              <p className={styles.emptyText}>此处暂无批注，在上方输入框添加</p>
            </div>
          )}
          {comments.map((c) => (
            <div key={c.id} className={styles.commentItem}>
              <div className={styles.commentHeader}>
                <div className={styles.commentAuthor}>
                  <span className={styles.avatar}>{c.author[0]}</span>
                  <span className={styles.authorName}>{c.author}</span>
                </div>
                <Badge variant={c.status === 'open' ? 'awaiting_reply' : 'resolved'} />
              </div>
              <p className={styles.commentContent}>{c.content}</p>
              <div className={styles.commentFooter}>
                <span className={styles.commentTime}>
                  {new Date(c.created_at).toLocaleString('zh-CN', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
                {c.measure_ref && <span className={styles.commentRef}>{c.measure_ref}</span>}
                {c.status === 'open' && (
                  <button className={styles.resolveBtn} onClick={() => onResolve(c.id)}>
                    标记解决
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 输入区 */}
        <div className={styles.inputArea}>
          <textarea
            className={`${styles.textInput} ${error ? styles.inputError : ''}`}
            placeholder="输入批注内容..."
            value={input}
            onChange={(e) => { setInput(e.target.value); if (error) setError(''); }}
            rows={2}
          />
          {error && (
            <div className={styles.filterError}>
              <span className={styles.filterErrorIcon}>🚫</span>
              <span>{error}</span>
            </div>
          )}
          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={!input.trim() || submitting}
          >
            {submitting ? '发送中…' : '发送批注'}
          </button>
        </div>
      </div>
    </div>
  );
}
