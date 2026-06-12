import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loading, ErrorMessage } from '@/components/shared/Loading';
import { Button } from '@/components/shared/Button';
import { VexflowStaff } from '@/components/notation/VexflowStaff';
import { PlayerBar } from '@/components/notation/PlayerBar';
import { useScoresStore, useSectionsStore } from '@/api/apiStore';
import { parseJianpu } from '@/utils/notation';
import type { ParsedScore } from '@/utils/notation';
import styles from './FullScoreView.module.css';

/* ── 渲染完整简谱单行（含时值线和延音线） ── */
function JianpuStaff({ content, label }: { content: string; label: string }) {
  // 检测是否为简谱（以 1= 开头）或纯文本（中文说明等）
  const isNotation = content?.trim().match(/^1=\S+\s+\d+\/\d+/m);

  if (!content || !isNotation) {
    return (
      <div className={styles.textSection}>
        <div className={styles.textContent}>{content || ''}</div>
      </div>
    );
  }

  const parsed = parseJianpu(content);

  if (parsed.measures.length === 0) {
    return <div className={styles.textSection}><div className={styles.textContent}>{content}</div></div>;
  }

  return (
    <div className={styles.staffSection}>
      <div className={styles.staffHeader}>
        {parsed.key && <span className={styles.headerKey}>{parsed.key}</span>}
        {parsed.timeSignature && <span className={styles.headerTime}>{parsed.timeSignature}</span>}
        {parsed.tempo && <span className={styles.headerTempo}>♩ {parsed.tempo}</span>}
      </div>
      <div className={styles.staffRows}>
        {parsed.measures.map((m, mi) => {
          const GAP = 4;
          // 计算每个音符的宽度和水平位置
          type Layout = { w: number; x: number };
          const layouts: Layout[] = [];
          let xAcc = 0;
          for (const n of m.notes) {
            const w = n.isRest || n.isExtension ? 28 : Math.max(20, 22 * (4 / n.duration) * (n.isDot ? 1.5 : 1));
            layouts.push({ w, x: xAcc });
            xAcc += w + GAP;
          }
          const measW = xAcc;

          // 检测连音组：找到连续 hasTie→hasTieEnd 的音符链
          type TieG = { fromX: number; toX: number };
          const ties: TieG[] = [];
          let ti = 0;
          while (ti < m.notes.length) {
            if (m.notes[ti].hasTie) {
              const start = ti;
              let end = ti;
              while (end + 1 < m.notes.length && m.notes[end + 1].hasTieEnd) {
                end++;
                if (!m.notes[end].hasTie) break; // 链结束
              }
              // 弧线从 start 音符中心到 end+1 音符中心
              const from = layouts[start];
              const to = layouts[Math.min(end + 1, m.notes.length - 1)];
              ties.push({ fromX: from.x + from.w / 2, toX: to.x + to.w / 2 });
              ti = end + 1;
            } else {
              ti++;
            }
          }

          return (
          <div key={mi} className={styles.measure} style={{ position: 'relative' }}>
            {m.notes.map((n, ni) => {
              if (n.isRest) return <span key={ni} className={styles.rest}>0</span>;
              if (n.isExtension) return <span key={ni} className={styles.tie}>—</span>;
              let txt = '';
              if (n.accidental === '#') txt += '#';
              else if (n.accidental === 'b') txt += 'b';
              txt += n.pitch;
              return (
                <span key={ni} className={styles.noteWrap} style={{ minWidth: `${layouts[ni].w}px` }}>
                  <span
                    className={`${styles.note} ${n.octaveDots > 0 ? styles.noteHigh : ''} ${n.octaveDots >= 2 ? styles.noteDHigh : ''} ${n.octaveDots < 0 ? styles.noteLow : ''}`}
                  >
                    {txt}
                  </span>
                </span>
              );
            })}
            {/* 连音弧线 SVG 覆盖层 — 按实际位置精确绘制 */}
            {ties.length > 0 && (
              <svg className={styles.tieOverlay} width={measW} height="15" viewBox={`0 0 ${measW} 16`} style={{ position: 'absolute', top: 10, left: 0, pointerEvents: 'none', overflow: 'visible' }}>
                {ties.map((t, ti) => (
                  <path key={ti} d={`M ${t.fromX + 2} 12 Q ${(t.fromX + t.toX) / 2} 2 ${t.toX - 2} 12`} stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" fill="none" />
                ))}
              </svg>
            )}
            <span className={styles.barline}>|</span>
          </div>
          );
        })}
      </div>
    </div>
  );
}

export function FullScoreView() {
  const { scoreId } = useParams();
  const navigate = useNavigate();
  const scoresAPI = useScoresStore();
  const sectionsAPI = useSectionsStore();

  const [score, setScore] = useState<any>(null);
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStaff, setShowStaff] = useState(false);

  useEffect(() => {
    if (!scoreId) return;
    setLoading(true);
    fetch(`/api/scores/${scoreId}/full-score`)
      .then((r) => r.json())
      .then((data) => {
        setScore(data.score);
        setSections(data.sections.filter((s: any) => s.type === 'section'));
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [scoreId]);

  // 合并所有简谱乐段为一个组合 ParsedScore 用于全谱播放（跳过中文文本）
  const combinedParsed = useMemo<ParsedScore>(() => {
    const allMeasures: any[] = [];
    let firstKey = '1=C';
    let firstTs = '4/4';
    let firstTempo: string | null = null;
    for (const s of sections) {
      if (!s.content?.match(/^1=\S+\s+\d+\/\d+/m)) continue;
      const p = parseJianpu(s.content);
      if (p.measures.length > 0) {
        allMeasures.push(...p.measures);
        if (firstKey === '1=C' && p.key) firstKey = p.key;
        if (firstTs === '4/4' && p.timeSignature) firstTs = p.timeSignature;
        if (!firstTempo && p.tempo) firstTempo = p.tempo;
      }
    }
    return { key: firstKey, timeSignature: firstTs, tempo: firstTempo, measures: allMeasures, totalBeats: 4, beatUnit: 4 };
  }, [sections]);

  const handlePrint = () => window.print();

  if (loading) return <Loading text="加载完整乐谱…" />;
  if (error) return <ErrorMessage message={error} />;
  if (!score) return <ErrorMessage message="未找到乐谱" />;

  return (
    <div className={styles.page}>
      {/* 工具栏（打印时隐藏） */}
      <div className={styles.toolbar}>
        <div>
          <h1 className={styles.title}>🎼 {score.name}</h1>
          <p className={styles.subtitle}>{score.composer} · 共 {sections.length} 个乐段</p>
        </div>
        <div className={styles.toolbarActions}>
          <Button variant="secondary" size="md" onClick={() => navigate(-1)}>← 返回</Button>
          <Button variant="ghost" size="md" onClick={() => setShowStaff(!showStaff)}>
            {showStaff ? '♩ 简谱' : '𝄞 五线谱'}
          </Button>
          <Button variant="primary" size="md" onClick={handlePrint}>♩ 导出 PDF</Button>
        </div>
      </div>

      {/* 全谱播放器（仅在有简谱数据时显示） */}
      {combinedParsed.measures.length > 0 && (
        <PlayerBar parsed={combinedParsed} tempo={null} />
      )}

      {/* 乐谱主内容 */}
      <div className={styles.scoreContent}>
        {/* 封面信息 */}
        <div className={styles.cover}>
          <h1 className={styles.coverTitle}>{score.name}</h1>
          <p className={styles.coverComposer}>{score.composer}</p>
          {score.description && <p className={styles.coverDesc}>{score.description}</p>}
        </div>

        {/* 乐谱正文 */}
        {sections.map((section, i) => (
          <div key={section.id} className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionNumber}>{i + 1}</span>
              <h2 className={styles.sectionName}>{section.name}</h2>
              {section.tempo && <span className={styles.sectionTempo}>♩= {section.tempo}</span>}
            </div>
            {showStaff && section.content ? (
              <VexflowStaff parsed={parseJianpu(section.content)} />
            ) : (
              <JianpuStaff content={section.content} label={section.name} />
            )}
          </div>
        ))}

        {/* 尾部 */}
        <div className={styles.footer}>
          <p>由「谱审」生成 · {new Date().toLocaleDateString('zh-CN')}</p>
        </div>
      </div>
    </div>
  );
}
