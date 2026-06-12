import { useState, useRef } from 'react';
import { useReviewStore } from '@/store';
import { ScoreTypeSwitcher } from '@/components/shared/ScoreTypeSwitcher';
import { AnnotationModal } from '@/components/annotation/AnnotationModal';
import { parseJianpu, noteToDisplay, noteGlyph, computeMeasureTies } from '@/utils/notation';
import type { NoteToken, ParsedScore } from '@/utils/notation';
import type { SectionRow, CommentRow } from '@/api';
import { VexflowStaff } from './VexflowStaff';
import { PlayerBar } from './PlayerBar';
import styles from './StaffView.module.css';

interface StaffViewProps {
  section?: SectionRow | null;
  comments?: CommentRow[];
  onAddComment?: (measure: number, content: string) => Promise<void>;
  onResolveComment?: (id: number) => Promise<void>;
}

/* ── 渲染简谱单个音符（标准6.2.5/5.12.2.3a：按时值占位） ── */
function JianpuNote({ note }: { note: NoteToken }) {
  const display = noteToDisplay(note);
  const glyph = noteGlyph(note);
  // 时长比例（附点 ×1.5）：全=4 二分=2 四分=1 八分=0.5...
  const durRatio = (note.isRest || note.isExtension ? 1 : 4 / note.duration) * (note.isDot ? 1.5 : 1);
  const baseWidth = 28;
  const noteWidth = Math.max(baseWidth * durRatio, 20);

  return (
    <span className={`${styles.jpNote} ${note.octaveDots > 0 ? styles.jpHigh : ''} ${note.octaveDots >= 2 ? styles.jpDHigh : ''} ${note.octaveDots < 0 ? styles.jpLow : ''} ${note.isDot ? styles.jpDot : ''} ${note.isStaccato ? styles.jpStaccato : ''} ${note.isAccent ? styles.jpAccent : ''} ${note.isTenuto ? styles.jpTenuto : ''} ${note.duration >= 8 ? styles.jpShort : ''} ${note.fermata ? styles.jpFermata : ''} ${note.isRest ? styles.jpRest : ''}`}
      style={{ minWidth: `${noteWidth}px` }}>
      {display}
      {/* 高音点 */}
      {note.octaveDots > 0 && <sup className={styles.jpOctaveUp}>{'˙'.repeat(note.octaveDots)}</sup>}
      {note.octaveDots < 0 && <sub className={styles.jpOctaveDown}>{'˙'.repeat(Math.abs(note.octaveDots))}</sub>}
      {/* 断音· */}
      {note.isStaccato && <span className={styles.jpStaccDot}>·</span>}
      {/* 重音 */}
      {note.isAccent && <span className={styles.jpAccentMark}>{'>'}</span>}
      {/* 保持音 */}
      {note.isTenuto && <span className={styles.jpTenutoMark}>—</span>}
      {/* 附点 */}
      {note.isDot && <span className={styles.jpDotMark}>•</span>}
      {/* 延长号 */}
      {note.fermata && <span className={styles.jpFermataMark}>𝅭</span>}
      {/* 力度 */}
      {note.dynamics && <sup className={styles.jpDyn}>{note.dynamics}</sup>}
    </span>
  );
}

/* ── 按拍分组（标准11.5.2.3b：单位拍呈现要分明） ── */
function groupNotesByBeat(notes: NoteToken[], totalBeats: number): NoteToken[][] {
  if (notes.length === 0) return [];
  if (totalBeats <= 1) return [notes]; // 单拍子不分
  const groups: NoteToken[][] = [[]];
  let beatAcc = 0;
  const beatSize = 4; // 一个四分音符=1拍（在duration体系中）
  for (const n of notes) {
    if (n.isExtension) {
      groups[groups.length - 1].push(n);
      continue;
    }
    const base = n.isRest ? 4 / Math.max(n.duration, 4) : 4 / n.duration;
    const noteBeats = base * (n.isDot ? 1.5 : 1);
    if (beatAcc + noteBeats > beatSize + 0.01 && groups[groups.length - 1].length > 0) {
      groups.push([]);
      beatAcc = 0;
    }
    groups[groups.length - 1].push(n);
    beatAcc += noteBeats;
  }
  return groups;
}

/* ── 渲染简谱小节 ── */
function JianpuMeasure({ notes, beats, measureNum, hasAnnotation, hasTieEnd, hasTieStart, onClick, totalBeats }: {
  notes: NoteToken[]; beats?: string; measureNum: number;
  hasAnnotation: boolean; hasTieEnd: boolean; hasTieStart: boolean; onClick: () => void;
  totalBeats?: number;
}) {
  // 音符密度控制
  const noteCount = notes.length || 1;
  const gapPx = 3; // 音符间最小间距
  const fontSizePx = noteCount <= 6 ? 32 : 24;
  const padPx = noteCount <= 4 ? '28px 20px' : '28px 12px';
  // 按拍分组（标准11.5.2.3b）
  const groups = groupNotesByBeat(notes, totalBeats || 4);

  return (
    <div className={styles.jpMeasure} onClick={onClick} style={{ padding: padPx }}>
      {/* 节拍标记 */}
      {beats && <span className={styles.jpBeats}>{beats}</span>}
      {/* 跨跃连接开始弧线（从上小节过来） */}
      {hasTieEnd && <span className={styles.jpTieEnd} />}
      <div className={styles.jpNotesRow} style={{ gap: `${gapPx}px`, fontSize: `${fontSizePx}px` }}>
        {groups.map((group, gi) => (
          <span key={gi} style={{ display: 'inline-flex', alignItems: 'center', gap: `${gapPx}px`, position: 'relative', paddingTop: '20px' }}>
            {group.map((n, i) => (
              <span key={i} className={styles.jpNoteSegment} style={{ display: 'contents' }}>
                <JianpuNote note={n} />
                {n.hasTie && i < group.length - 1 && (
                  <span className={styles.jpInnerTie} />
                )}
              </span>
            ))}
            {/* 拍组之间增加分隔间距（标准11.5.2.3b） */}
            {gi < groups.length - 1 && (
              <span className={styles.jpBeatSep} />
            )}
          </span>
        ))}
      </div>
      {/* 跨跃连接结束弧线（连到下一小节） */}
      {hasTieStart && <span className={styles.jpTieStart} />}
      <span className={styles.jpBarline}>|</span>
      {hasAnnotation && <span className={styles.marker}>◆</span>}
    </div>
  );
}

/* ── 头部 ── */
function ScoreHeader({ parsed, section }: { parsed: ParsedScore; section: SectionRow }) {
  return (
    <div className={styles.scoreHeader}>
      <span className={styles.shKey}>{parsed.key}</span>
      <span className={styles.shTime}>{parsed.timeSignature}</span>
      <span className={styles.shTempo}>{parsed.tempo || section.tempo || ''}</span>
    </div>
  );
}

/* ── 主组件 ── */
export function StaffView({ section, comments = [], onAddComment, onResolveComment }: StaffViewProps) {
  const { scoreType, addAnnotation } = useReviewStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMeasure, setModalMeasure] = useState(1);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  if (!section) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>🎵</span>
          <p className={styles.emptyText}>从左侧选择一个乐段</p>
        </div>
      </div>
    );
  }

  const parsed = parseJianpu(section.content);

  const measuresWithTies = computeMeasureTies(parsed.measures);

  const commentCountByMeasure: Record<number, number> = {};
  comments.forEach((c) => {
    // 从 "第1-4小节" 或 "第1小节" 中提取首个小节号
    let m = 1;
    if (c.measure_ref) {
      const nums = c.measure_ref.match(/\d+/g);
      if (nums) m = parseInt(nums[0]);
    }
    commentCountByMeasure[m] = (commentCountByMeasure[m] || 0) + 1;
  });

  const handleClick = (num: number) => { setModalMeasure(num); setModalOpen(true); };
  const handleSubmit = async (content: string) => {
    if (onAddComment) await onAddComment(modalMeasure, content);
    else {
      const id = `a-${Date.now()}`;
      addAnnotation({
        id, sectionId: String(section.id), measureRef: modalMeasure,
        author: { id: '1', name: '当前用户', avatar: '', online: true },
        content, type: 'text', status: 'awaiting_reply',
        createdAt: new Date().toISOString(), replies: [], position: { x: 0, y: 0 },
      });
    }
  };
  const handleResolve = async (id: number) => { if (onResolveComment) await onResolveComment(id); };

  return (
    <div className={styles.container}>
      {/* 工具栏 */}
      <div className={styles.toolbar}>
        <ScoreTypeSwitcher />
        <div className={styles.toolbarRight}>
          <span className={styles.sectionInfo}>{section.name}</span>
        </div>
      </div>

      {/* 乐谱区域 */}
      <div className={styles.scrollArea} ref={scrollAreaRef}>
        <div className={styles.staffSystem}>
          <ScoreHeader parsed={parsed} section={section} />

          {scoreType === 'staff' ? (
            /* ── 五线谱（VexFlow 渲染） ── */
            <VexflowStaff
              parsed={parsed}
              onMeasureClick={handleClick}
              markedMeasures={new Set(Object.keys(commentCountByMeasure).map(Number))}
            />
          ) : (
            /* ── 简谱 ── */
            <div className={styles.jianpuSection}>
              <div className={styles.jpRows}>
                {measuresWithTies.map((m, i) => (
                  <JianpuMeasure
                    key={i}
                    notes={m.notes}
                    beats={m.beats}
                    measureNum={i + 1}
                    hasAnnotation={(commentCountByMeasure[i + 1] || 0) > 0}
                    hasTieEnd={!!m.hasTieEnd}
                    hasTieStart={!!m.hasTieStart}
                    onClick={() => handleClick(i + 1)}
                    totalBeats={parsed.totalBeats}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 播放控制 */}
      <PlayerBar parsed={parsed} tempo={section.tempo} />

      {modalOpen && (
        <AnnotationModal
          measureNum={modalMeasure}
          sectionName={section.name}
          comments={comments.filter((c) => {
            let m = 1;
            if (c.measure_ref) {
              const nums = c.measure_ref.match(/\d+/g);
              if (nums) m = parseInt(nums[0]);
            }
            return m === modalMeasure;
          })}
          onClose={() => setModalOpen(false)}
          onSubmit={handleSubmit}
          onResolve={handleResolve}
        />
      )}
    </div>
  );
}
