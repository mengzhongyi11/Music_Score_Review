import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loading, ErrorMessage } from '@/components/shared/Loading';
import { Button } from '@/components/shared/Button';
import { useScoresStore, useSectionsStore } from '@/api/apiStore';
import styles from './FullScoreView.module.css';

/* 解析简谱 */
function parseJianpu(content: string | null) {
  if (!content) return { header: '', measures: [] as string[][] };
  const lines = content.split('\n').filter(Boolean);
  const header = lines.find((l) => l.startsWith('1=')) || '';
  const dataLines = lines.filter((l) => !l.startsWith('1=') && l.trim());
  const measures = dataLines.flatMap((line) => {
    const cleaned = line.replace(/^[|]\s*/, '').trim();
    return cleaned
      .split('|')
      .map((m) => m.trim().split(/\s+/).filter(Boolean))
      .filter((m) => m.length > 0);
  });
  return { header, measures };
}

/* 渲染简谱行 */
function JianpuStaff({ content, label }: { content: string; label: string }) {
  const { header, measures } = parseJianpu(content);

  if (!content) {
    return (
      <div className={styles.textSection}>
        <div className={styles.sectionLabel}>{label}</div>
        <div className={styles.textContent}>{content}</div>
      </div>
    );
  }

  return (
    <div className={styles.staffSection}>
      <div className={styles.sectionLabel}>{label}</div>
      {header && <div className={styles.staffHeader}>{header}</div>}
      <div className={styles.staffRows}>
        {measures.map((measure, mi) => (
          <div key={mi} className={styles.measure}>
            {measure.map((note, ni) => {
              const isHigh = note.includes('̅');
              const isDotted = note.includes('•');
              const isRest = note.includes('-');
              const hasMark = note.includes('-f') || note.includes('-p') || note.includes('-mf');
              const cleanNote = note.replace(/[•̅\-fpmscrailrgv]|ff|pp|mf|mp/g, '');
              return (
                <span key={ni} className={`${styles.note} ${isHigh ? styles.noteHigh : ''}`}>
                  {isRest ? '𝄽' : (cleanNote || '—')}
                </span>
              );
            })}
            <span className={styles.barline}>|</span>
          </div>
        ))}
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
          <Button variant="primary" size="md" onClick={handlePrint}>♩ 导出 PDF</Button>
        </div>
      </div>

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
            <JianpuStaff content={section.content} label={section.name} />
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
