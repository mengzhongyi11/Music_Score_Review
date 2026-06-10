import { useState } from 'react';
import { useReviewStore, useUserStore } from '@/store';
import { ScoreTypeSwitcher } from '@/components/shared/ScoreTypeSwitcher';
import { AnnotationModal } from '@/components/annotation/AnnotationModal';
import type { SectionRow, CommentRow } from '@/api';
import styles from './StaffView.module.css';

const STAFF_LINES = 5;

interface StaffViewProps {
  section?: SectionRow | null;
  comments?: CommentRow[];
  onAddComment?: (measure: number, content: string) => Promise<void>;
  onResolveComment?: (id: number) => Promise<void>;
}

/* 解析简谱内容 */
function parseContent(content: string | null): string[][] {
  if (!content) return [['1', '2', '3', '4', '5', '6', '7']];
  const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('1='));
  return lines.map((line) => {
    const cleaned = line.replace(/[|]/g, '').trim();
    return cleaned.split(/\s+/).filter(Boolean).slice(0, 16);
  });
}

export function StaffView({ section, comments = [], onAddComment, onResolveComment }: StaffViewProps) {
  const { scoreType, annotations, addAnnotation } = useReviewStore();
  const { collaborators, currentUser } = useUserStore();

  const [selectedMeasure, setSelectedMeasure] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMeasure, setModalMeasure] = useState(1);

  const notes = parseContent(section?.content || null);

  // 点击小节
  const handleMeasureClick = (measure: number) => {
    setModalMeasure(measure);
    setModalOpen(true);
  };

  // 提交批注
  const handleSubmitComment = async (content: string) => {
    if (onAddComment) {
      await onAddComment(modalMeasure, content);
    } else {
      // 本地 fallback
      const id = `a-${Date.now()}`;
      addAnnotation({
        id,
        sectionId: String(section?.id || '0'),
        measureRef: modalMeasure,
        author: currentUser,
        content,
        type: 'text',
        status: 'awaiting_reply',
        createdAt: new Date().toISOString(),
        replies: [],
        position: { x: 0, y: 0 },
      });
    }
  };

  // 解决批注
  const handleResolve = async (id: number) => {
    if (onResolveComment) {
      await onResolveComment(id);
    }
  };

  if (!section) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>🎵</span>
          <p className={styles.emptyText}>从左侧选择一个乐段开始审阅</p>
        </div>
      </div>
    );
  }

  // 统计每个小节有多少批注
  const commentCountByMeasure: Record<number, { total: number; open: number }> = {};
  comments.forEach((c) => {
    const m = c.measure_ref ? parseInt(c.measure_ref.replace(/\D/g, '')) || 1 : 1;
    if (!commentCountByMeasure[m]) commentCountByMeasure[m] = { total: 0, open: 0 };
    commentCountByMeasure[m].total++;
    if (c.status === 'open') commentCountByMeasure[m].open++;
  });

  return (
    <div className={styles.container}>
      {/* 顶部工具栏 */}
      <div className={styles.toolbar}>
        <ScoreTypeSwitcher />
        <div className={styles.toolbarActions}>
          <button className={styles.toolBtn} title="缩放">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.2"/><path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          </button>
          <button className={styles.toolBtn} title="全屏">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3h4M3 3v4M13 3H9M13 3v4M3 13h4M3 13V9M13 13H9M13 13V9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>

      {/* 乐谱渲染区 */}
      <div className={styles.scrollArea}>
        <div className={styles.staffSystem}>
          {scoreType === 'staff' ? (
            /* 五线谱视图 */
            <div className={styles.staff}>
              <div className={styles.staffHeader}>
                <div className={styles.clef}>𝄞</div>
                <div className={styles.keySig}>{section.key_signature || '♮'}</div>
                <div className={styles.timeSig}>{section.time_signature || '4/4'}</div>
              </div>
              <div className={styles.measures}>
                {notes.map((measureNotes, mi) => {
                  const measureNum = mi + 1;
                  const cc = commentCountByMeasure[measureNum];
                  return (
                    <div
                      key={mi}
                      className={`${styles.measure} ${modalMeasure === measureNum && modalOpen ? styles.measureActive : ''}`}
                      onClick={() => handleMeasureClick(measureNum)}
                    >
                      <div className={styles.staffLines}>
                        {Array.from({ length: STAFF_LINES }, (_, i) => (
                          <div key={i} className={styles.staffLine} style={{ top: `${i * 25}%` }} />
                        ))}
                      </div>
                      <div className={styles.measureContent}>
                        {measureNotes.map((n, ni) => (
                          <div
                            key={ni}
                            className={styles.note}
                            style={{ left: `${15 + ni * 22}%`, top: `${20 + (ni % 3) * 25}%` }}
                          >
                            ♩
                          </div>
                        ))}
                        <div className={styles.barline} />
                      </div>
                      <span className={styles.measureNum}>{measureNum}</span>
                      {/* 批注标记点 */}
                      {cc && cc.total > 0 && (
                        <span className={`${styles.annotationMarker} ${cc.open > 0 ? styles.markerOpen : styles.markerResolved}`}>
                          {cc.total}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* 简谱视图 */
            <div className={styles.jianpu}>
              <div className={styles.jianpuHeader}>
                <span className={styles.jianpuKey}>1={section.key_signature || 'C'}</span>
                <span className={styles.jianpuTime}>{section.time_signature || '4/4'}</span>
                <span className={styles.jianpuTempo}>{section.tempo || '♩=120'}</span>
              </div>
              <div className={styles.measures}>
                {notes.map((measureNotes, mi) => {
                  const measureNum = mi + 1;
                  const cc = commentCountByMeasure[measureNum];
                  return (
                    <div
                      key={mi}
                      className={`${styles.jianpuMeasure} ${modalMeasure === measureNum && modalOpen ? styles.measureActive : ''}`}
                      onClick={() => handleMeasureClick(measureNum)}
                    >
                      <div className={styles.jianpuNotes}>
                        {measureNotes.map((n, ni) => (
                          <span key={ni} className={`${styles.jianpuNote} ${n.includes('̅') ? styles.jianpuHigh : ''}`}>
                            {n.replace(/[•̅]/g, '')}
                          </span>
                        ))}
                      </div>
                      <span className={styles.measureNum}>{measureNum}</span>
                      {/* 批注标记点 */}
                      {cc && cc.total > 0 && (
                        <span className={`${styles.annotationMarker} ${cc.open > 0 ? styles.markerOpen : styles.markerResolved}`}>
                          {cc.total}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 播放控制 */}
      <div className={styles.player}>
        <div className={styles.playerControls}>
          <button className={styles.playerBtn}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 3l9 5-9 5V3z" fill="currentColor"/></svg>
          </button>
          <div className={styles.progressBar}>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: '35%' }} />
              <div className={styles.progressThumb} style={{ left: '35%' }} />
            </div>
          </div>
          <span className={styles.timeDisplay}>0:00 / 0:00</span>
        </div>
        <div className={styles.playerMeta}>
          <span className={styles.tempo}>{section.tempo || '—'}</span>
          <span className={styles.key}>{section.key_signature || '—'}调</span>
        </div>
      </div>

      {/* 固定批注弹窗 */}
      {modalOpen && (
        <AnnotationModal
          measureNum={modalMeasure}
          sectionName={section.name}
          comments={comments.filter((c) => {
            const m = c.measure_ref ? parseInt(c.measure_ref.replace(/\D/g, '')) || 1 : 1;
            return m === modalMeasure;
          })}
          onClose={() => setModalOpen(false)}
          onSubmit={handleSubmitComment}
          onResolve={handleResolve}
        />
      )}
    </div>
  );
}
