import { useState } from 'react';
import { useScoresStore } from '@/api/apiStore';
import styles from './CreateScoreModal.module.css';

interface CreateScoreModalProps {
  onClose: () => void;
  onCreated: (id: number) => void;
}

export function CreateScoreModal({ onClose, onCreated }: CreateScoreModalProps) {
  const scoresAPI = useScoresStore();
  const [name, setName] = useState('');
  const [composer, setComposer] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !composer.trim()) return;
    setSubmitting(true);
    try {
      const id = await scoresAPI.createScore({
        name: name.trim(),
        composer: composer.trim(),
        description: description.trim() || undefined,
        owner_id: 1,
      });
      onCreated(id);
      onClose();
    } catch (err: any) {
      alert('创建失败: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>🎼 新建乐谱</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label}>乐谱名称 *</label>
            <input
              className={styles.input}
              placeholder="例：月光奏鸣曲"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>作曲者 *</label>
            <input
              className={styles.input}
              placeholder="例：贝多芬"
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>描述</label>
            <textarea
              className={styles.textarea}
              placeholder="可选：添加乐谱说明..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>取消</button>
          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={!name.trim() || !composer.trim() || submitting}
          >
            {submitting ? '创建中…' : '创建乐谱'}
          </button>
        </div>
      </div>
    </div>
  );
}
