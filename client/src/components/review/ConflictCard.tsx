import { useState } from 'react';
import { Button } from '@/components/shared/Button';
import { mergeApi } from '@/api';
import type { ConflictRow } from '@/api';
import styles from './ConflictCard.module.css';

interface Props {
  conflict: ConflictRow;
  onResolved: () => void;
}

const typeConfig: Record<string, { label: string; color: string; icon: string }> = {
  note_content:   { label: '音符冲突', color: '#cf222e', icon: '♪' },
  tempo:          { label: '速度冲突', color: '#d4920b', icon: '⏱' },
  key_signature:  { label: '调号冲突', color: '#cf222e', icon: '♯' },
  time_signature: { label: '拍号冲突', color: '#d4920b', icon: '⌛' },
  metadata:       { label: '其他冲突', color: '#57606a', icon: '⚙' },
};

export function ConflictCard({ conflict, onResolved }: Props) {
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState(false);
  const cfg = typeConfig[conflict.conflict_type] || { label: conflict.conflict_type, color: '#57606a', icon: '⚙' };

  const handleResolve = async (resolution: 'accept_main' | 'accept_branch') => {
    setResolving(true);
    try {
      await mergeApi.resolveConflict(conflict.id, { resolution, resolved_by: 1 });
      setResolved(true);
      onResolved();
    } catch {
      alert('解决冲突失败');
    }
    setResolving(false);
  };

  if (resolved) return null;

  return (
    <div className={styles.card}>
      {/* 头部：冲突类型 + 检测来源标签 */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.typeTag} style={{ color: cfg.color, borderColor: cfg.color }}>
            {cfg.icon} {cfg.label}
          </span>
          <span className={styles.sourceTag}>🔍 系统检测</span>
        </div>
        <span className={styles.branchValue}>{conflict.branchValue}</span>
      </div>

      {conflict.section_name && (
        <div className={styles.sectionName}>📄 {conflict.section_name}</div>
      )}

      {/* 冲突详情（系统检测结果） */}
      <div className={styles.detailBox}>
        <span className={styles.detailLabel}>系统检测</span>
        {conflict.measureIndex && (
          <span className={styles.location}>
            第 {conflict.measureIndex} 小节{conflict.noteIndex ? `第 ${conflict.noteIndex} 音` : ''}
          </span>
        )}
        <p className={styles.detailDesc}>{conflict.conflict_detail}</p>
      </div>

      {/* 值对比 */}
      <div className={styles.compare}>
        <div className={styles.compareCol}>
          <span className={styles.compareLabel}>主库（原）</span>
          <code className={styles.compareVal}>{conflict.mainValue}</code>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.vsArrow}><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <div className={styles.compareCol}>
          <span className={styles.compareLabel}>分支（新）</span>
          <code className={styles.compareVal}>{conflict.branchValue}</code>
        </div>
      </div>

      {/* AI 建议（如果存在） */}
      {conflict.merge_suggestion && (
        <div className={styles.suggestionBox}>
          <span className={styles.suggestionLabel}>🤖 AI 建议</span>
          <p className={styles.suggestionText}>{conflict.merge_suggestion}</p>
        </div>
      )}

      {/* 操作按钮 */}
      {conflict.status === 'pending' && (
        <div className={styles.actions}>
          <Button variant="primary" size="sm" loading={resolving} onClick={() => handleResolve('accept_branch')}>
            ✓ 采用分支
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleResolve('accept_main')}>
            ✓ 采用主库
          </Button>
        </div>
      )}
    </div>
  );
}
