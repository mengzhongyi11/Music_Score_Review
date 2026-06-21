/**
 * VexFlow 五线谱渲染组件
 *
 * 核心改进（相对简谱 CSS 渲染）：
 * 1. 调号感知的音高映射 — 简谱数字 1-7 根据调号映射到正确的五线谱音高
 * 2. 完整的小节渲染 — 谱号、调号、拍号、音符、演奏法、连音线
 * 3. 行自动换行 — 当小节宽度超过容器宽度时自动换到下一行
 * 4. 标准五线谱排版 — 使用 VexFlow 4.x 引擎
 */
import { useRef, useEffect } from 'react';
import { MeasureBuilder, VF, jianpuToVexflowKey } from '@/utils/VexFlowWrapper';
import type { ParsedScore, NoteToken } from '@/utils/notation';
import styles from './StaffView.module.css';

interface Props {
  parsed: ParsedScore;
  onMeasureClick?: (num: number) => void;
  markedMeasures?: Set<number>; // 有批注的小节号集合
}

/* ── 时值映射（使用 VexFlow 原生数字时值码） ── */

function toVfDuration(d: number, isDot: boolean = false): string {
  // VexFlow 4.x 原⽣格式：1=全 2=二分 4=四分 8=八分
  const base = String(d);
  return isDot ? base + 'd' : base;
}

/* ── 小节宽度估算（按拍号比例，确保视觉填充均匀） ── */

const BEAT_WIDTH = 72; // 每拍宽度（px）

function estimateMeasureWidth(tokens: NoteToken[], isFirstInRow: boolean, totalBeats: number): number {
  const noteCount = tokens.length || 1;
  // 拍号基础宽度：每拍 72px
  const beatsWidth = Math.max(totalBeats * BEAT_WIDTH, 100);
  // 音符宽松度：避免太挤
  const notePadding = noteCount * 25;
  const mw = Math.max(beatsWidth, notePadding);
  return mw + (isFirstInRow ? 90 : 0);
}

const MAX_ROW_WIDTH = 960; // 行最大宽度（px）

/* ── 组件 ── */

export function VexflowStaff({ parsed, onMeasureClick, markedMeasures }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !parsed.measures.length) return;
    container.innerHTML = '';

    const rawKey = (parsed.key || '1=C').replace('1=', '');
    // 简谱记法 → VexFlow 记法：bE → Eb, c → C
    const normalizedKey = (() => {
      let k = rawKey.trim();
      if (k.length === 1) return k.toUpperCase();
      if (/^[b#][A-Ga-g]$/.test(k)) k = k[1].toUpperCase() + k[0];
      return k;
    })();
    const bpM = parsed.totalBeats || 4;
    const bV = parsed.beatUnit || 4;

    // ---- 预处理：收集所有有效小节 ----
    type MeasureMeta = {
      tokens: NoteToken[];
      measureNum: number;
      measIdx: number;
      hasTieEnd: boolean;
      hasTieStart: boolean;
    };

    const allMeasures: MeasureMeta[] = [];

    for (let mi = 0; mi < parsed.measures.length; mi++) {
      const meas = parsed.measures[mi];
      const tokens = meas.notes.filter((n) => !n.isExtension);
      if (!tokens.length) continue;

      const nonExt = meas.notes.filter((n) => !n.isExtension);
      const firstNote = nonExt[0];
      const lastNote = nonExt[nonExt.length - 1];

      allMeasures.push({
        tokens,
        measureNum: mi + 1,
        measIdx: mi,
        hasTieEnd: !!(firstNote?.hasTieEnd),
        hasTieStart: !!(lastNote?.hasTie),
      });
    }

    if (!allMeasures.length) return;

    // ---- 分组为行（自动换行） ----
    const rows: MeasureMeta[][] = [];
    let currentRow: MeasureMeta[] = [];
    let currentRowWidth = 0;

    for (const mm of allMeasures) {
      const isFirstInRow = currentRow.length === 0;
      const mw = estimateMeasureWidth(mm.tokens, isFirstInRow, bpM);

      if (currentRowWidth + mw > MAX_ROW_WIDTH && currentRow.length > 0) {
        rows.push(currentRow);
        currentRow = [];
        currentRowWidth = 0;
        const mwFirst = estimateMeasureWidth(mm.tokens, true, bpM);
        currentRow.push(mm);
        currentRowWidth = mwFirst;
      } else {
        currentRow.push(mm);
        currentRowWidth += mw;
      }
    }

    if (currentRow.length > 0) rows.push(currentRow);

    // ---- 逐行渲染 ----
    for (const row of rows) {
      const rowDiv = document.createElement('div');
      rowDiv.style.cssText =
        'display:flex;align-items:flex-start;margin-bottom:6px;';
      container.appendChild(rowDiv);

      for (let ri = 0; ri < row.length; ri++) {
        const mm = row[ri];
        const { tokens, measureNum, measIdx, hasTieEnd, hasTieStart } = mm;
        const isFirstInRow = ri === 0;
        const mw = estimateMeasureWidth(tokens, isFirstInRow, bpM);

        // 小节容器 div
        const div = document.createElement('div');
        div.className = styles.sfMeasureBox;
        div.dataset.measure = String(measureNum);
        div.style.cssText =
          'display:inline-flex;flex-shrink:0;vertical-align:top;cursor:crosshair;position:relative;';
        div.onclick = () => onMeasureClick?.(measureNum);
        rowDiv.appendChild(div);

        // 跨小节连线标记
        if (hasTieEnd) {
          const tieEnd = document.createElement('span');
          tieEnd.className = styles.sfTieArcEnd;
          div.appendChild(tieEnd);
        }
        if (hasTieStart) {
          const tieStart = document.createElement('span');
          tieStart.className = styles.sfTieArcStart;
          div.appendChild(tieStart);
        }

        // 小节号
        if (measureNum % 5 === 1 || measureNum === 1) {
          const numSpan = document.createElement('span');
          numSpan.className = styles.sfMeasureNum;
          numSpan.textContent = String(measureNum);
          div.appendChild(numSpan);
        }

        // 批注标记红点
        if (markedMeasures?.has(measureNum)) {
          const dot = document.createElement('span');
          dot.className = styles.marker;
          dot.textContent = '◆';
          div.appendChild(dot);
        }

        // 每个小节独立 try-catch，避免一个失败影响全部
        try {
          const renderer = new VF.Renderer(div, VF.Renderer.Backends.SVG);
          renderer.resize(mw, 180);
          const ctx = renderer.getContext();
          const svgEl = div.querySelector('svg');
          if (svgEl) {
            svgEl.style.overflow = 'visible';
            svgEl.style.display = 'block';
          }

          const vfNotes: any[] = [];
          const tiePairs: { a: number; b: number }[] = [];

          for (let i = 0; i < tokens.length; i++) {
            const tok = tokens[i];

            if (tok.isRest) {
              const dur = toVfDuration(tok.duration, tok.isDot) + 'r';
              const note = new VF.StaveNote({
                clef: 'treble',
                keys: ['b/4'],
                duration: dur,
              });
              if (tok.isDot) {
                VF.Dot.buildAndAttach([note], { all: true });
              }
              vfNotes.push(note);
              continue;
            }

            const dur = toVfDuration(tok.duration, tok.isDot);

            // 和弦：多个键位
            if (tok.isChord && tok.chordNotes && tok.chordNotes.length > 1) {
              const keys = tok.chordNotes.map((cn) =>
                jianpuToVexflowKey(rawKey, cn.pitch, cn.octaveDots, cn.accidental)
              );
              const note = new VF.StaveNote({
                clef: 'treble',
                keys,
                duration: dur,
                auto_stem: true,
              });
              if (tok.isAccent)
                note.addModifier(new VF.Articulation('a>'), 0);
              if (tok.isStaccato)
                note.addModifier(new VF.Articulation('a.'), 0);
              if (tok.isTenuto)
                note.addModifier(new VF.Articulation('a-'), 0);
              if (tok.fermata)
                note.addModifier(new VF.Articulation('a@a'), 0);
              if (tok.isDot) {
                VF.Dot.buildAndAttach([note], { all: true });
              }
              vfNotes.push(note);
              continue;
            }

            // 普通单音符
            const vfKey = jianpuToVexflowKey(
              rawKey,
              tok.pitch,
              tok.octaveDots,
              tok.accidental,
            );

            const note = new VF.StaveNote({
              clef: 'treble',
              keys: [vfKey],
              duration: dur,
              auto_stem: true,
            });

            if (tok.isAccent)
              note.addModifier(new VF.Articulation('a>'), 0);
            if (tok.isStaccato)
              note.addModifier(new VF.Articulation('a.'), 0);
            if (tok.isTenuto)
              note.addModifier(new VF.Articulation('a-'), 0);
            if (tok.fermata)
              note.addModifier(new VF.Articulation('a@a'), 0);

            // 附点：VexFlow 4.x 需显式调用 Dot.buildAndAttach 创建可视化附点
            if (tok.isDot) {
              VF.Dot.buildAndAttach([note], { all: true });
            }

            vfNotes.push(note);

            if (tok.hasTie && i + 1 < tokens.length && !tokens[i + 1].isRest) {
              tiePairs.push({ a: i, b: i + 1 });
            }
          }

          const measure = new MeasureBuilder({
            x: 0,
            y: 35,
            width: mw,
            timeSignature: isFirstInRow ? `${bpM}/${bV}` : undefined,
            keySignature: isFirstInRow ? normalizedKey : undefined,
            isFirstMeasure: isFirstInRow,
            spacing: 17,
          });
          measure.addNotes(vfNotes);

          for (const tp of tiePairs) {
            measure.addTie(tp.a, tp.b);
          }

          measure.render(ctx);
        } catch (e) {
          console.error(
            `VexFlow 渲染失败 (${parsed.key} 第${measureNum}小节):`,
            e,
          );
          div.style.minHeight = '180px';
          div.style.opacity = '0.3';
          const err = document.createElement('span');
          err.style.cssText =
            'font-size:11px;color:#cf222e;position:absolute;bottom:2px;left:2px;';
          err.textContent = '⚠';
          div.appendChild(err);
        }
      }
    }
  }, [parsed, onMeasureClick]);

  return (
    <div
      ref={containerRef}
      style={{
        overflowX: 'auto',
        overflowY: 'visible',
        padding: '12px 0',
      }}
    />
  );
}
