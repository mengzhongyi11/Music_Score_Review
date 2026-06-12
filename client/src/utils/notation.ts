/* ═══════════════════════════════════════════
   乐谱渲染引擎
   标准：GB/T 46845-2025（五线谱）
         GB/T 46846-2025（简谱）
   ═══════════════════════════════════════════ */

/* ── 简谱解析 ── */

export interface ParsedMeasure {
  notes: NoteToken[];
  barline: 'single' | 'double' | 'end' | 'repeat' | 'none';
  beats?: string;       // 节拍标记如 "3+2" 等
  hasTieStart?: boolean; // 此小节有跨越连接到下一小节
  hasTieEnd?: boolean;   // 此小节是跨跃连接的结束
}

export interface NoteToken {
  raw: string;
  pitch: string;          // 纯音高数字 "1"-"7"
  octaveDots: number;     // 高音点数 0=中音 1=高音 2=倍高音 -1=低音 -2=倍低音
  duration: number;       // 时值 1=全 2=二分 4=四分 8=八分 16=十六分
  isDot: boolean;         // 附点
  isStaccato: boolean;    // 断音（音符上方实心点）
  isAccent: boolean;      // 重音 >
  isTenuto: boolean;      // 保持音 -
  hasTie: boolean;        // 同音连线（延音线）开始
  hasTieEnd: boolean;     // 同音连线结束
  isRest: boolean;        // 休止符
  isExtension: boolean;   // 延音线（增时线）
  isSlurStart: boolean;   // 圆滑线（连音线）开始
  isSlurEnd: boolean;     // 圆滑线结束
  accidental?: string;    // "#", "b", "n" (变音号)
  dynamics: string;       // 力度标记 p, f, mf, ff, pp, sfz
  articulation: string;   // 演奏法标记 tr, trem, arp, gliss
  fermata: boolean;       // 延长号 𝅝𝅭
}

export interface ParsedScore {
  key: string;
  timeSignature: string;
  tempo: string | null;
  measures: ParsedMeasure[];
  totalBeats: number;    // 每小节节拍数
  beatUnit: number;      // 拍单位
}

/* 解析简谱内容 */
export function parseJianpu(content: string | null): ParsedScore {
  const result: ParsedScore = {
    key: '1=C',
    timeSignature: '4/4',
    tempo: null,
    measures: [],
    totalBeats: 4,
    beatUnit: 4,
  };

  if (!content || !content.trim()) return result;

  const lines = content.split('\n').filter(Boolean);

  // 解析头部
  const headerLine = lines.find((l) => l.startsWith('1='));
  if (headerLine) {
    const parts = headerLine.trim().split(/\s+/);
    result.key = parts[0] || '1=C';
    result.timeSignature = parts[1] || '4/4';
    result.tempo = parts.slice(2).join(' ') || null;

    // 解析拍号
    const ts = result.timeSignature.split('/');
    result.totalBeats = parseInt(ts[0]) || 4;
    result.beatUnit = parseInt(ts[1]) || 4;
  }

  // 解析内容行
  const contentLines = lines.filter((l) => !l.startsWith('1=') && l.trim());
  if (contentLines.length === 0) return result;

  for (const line of contentLines) {
    let clean = line.trim();
    if (clean.startsWith('|')) clean = clean.slice(1);

    const measureStrs = clean.split('|').filter(Boolean);

    for (let m = 0; m < measureStrs.length; m++) {
      let raw = measureStrs[m].trim();
      const isLast = m === measureStrs.length - 1;

      // 判断小节线类型
      let barline: ParsedMeasure['barline'] = isLast ? 'single' : 'single';
      if (raw.endsWith('||')) { barline = 'double'; raw = raw.slice(0, -2).trim(); }
      else if (raw.endsWith('‖')) { barline = 'end'; raw = raw.slice(0, -1).trim(); }

      // 解析节拍标记如 [1+2+1]
      let beats: string | undefined;
      const beatMatch = raw.match(/^\[([0-9+]+)\]/);
      if (beatMatch) { beats = beatMatch[1]; raw = raw.slice(beatMatch[0].length).trim(); }

      const noteStrs = raw.split(/\s+/).filter(Boolean);
      const notes = noteStrs.map((ns) => parseNoteToken(ns, result.beatUnit));
      result.measures.push({ notes, barline, beats });
    }
  }

  return result;
}

/* 解析单个音符标记 */
export function parseNoteToken(raw: string, beatUnit?: number): NoteToken {
  const defaultDuration = beatUnit === 8 ? 8 : 4; // X/8拍默认八分音符
  const token: NoteToken = {
    raw, pitch: '', octaveDots: 0, duration: defaultDuration,
    isDot: false, isStaccato: false, isAccent: false, isTenuto: false,
    hasTie: false, hasTieEnd: false, isRest: false, isExtension: false,
    isSlurStart: false, isSlurEnd: false, dynamics: '', articulation: '',
    fermata: false,
  };

  // 检测休止符（支持 0, 0-, 0--, 0---）
  if (raw.startsWith('0') && /^0-*$/.test(raw)) {
    token.isRest = true;
    token.pitch = '0';
    const restHyph = raw.match(/-+$/);
    if (restHyph) {
      const hc = restHyph[0].length;
      if (hc >= 3) token.duration = 1;           // 全休止
      else if (hc === 2) { token.duration = 2; token.isDot = true; } // 附点二分休止
      else if (hc === 1) token.duration = 2;      // 二分休止
      // 0 休止 = 四分休止（默认 duration=4）
    }
    return token;
  }

  // 检测延音线（增时线）-
  if (/^--?$/.test(raw) || raw === '—') { token.isExtension = true; return token; }

  // 提取圆滑线标记 ( 和 )
  let work = raw;
  if (work.startsWith('(')) { token.isSlurStart = true; work = work.slice(1); }
  if (work.endsWith(')')) { token.isSlurEnd = true; work = work.slice(0, -1); }

  // 提取同音连线 ~
  if (work.startsWith('~')) { token.hasTieEnd = true; work = work.slice(1); }
  if (work.endsWith('~')) { token.hasTie = true; work = work.slice(0, -1); }

  // 提取变音号 #, b, ♮
  if (work.startsWith('#') || work.startsWith('♮') || (work.startsWith('b') && work.length > 1 && /[0-7]/.test(work[1]))) {
    if (work.startsWith('#')) { token.accidental = '#'; work = work.slice(1); }
    else if (work.startsWith('♮')) { token.accidental = 'n'; work = work.slice(1); }
    else if (work.startsWith('b')) { token.accidental = 'b'; work = work.slice(1); }
  } else if (work.length > 1 && work.endsWith('#') && /[0-7]/.test(work[work.length - 2])) {
    // 后缀变音号: 4#
    token.accidental = '#'; work = work.slice(0, -1);
  }

  // 提取断音标记 .（仅后缀 — 前缀 "." 是低八度记号）
  if (work.endsWith('.') && !work.endsWith('..')) { token.isStaccato = true; work = work.slice(0, -1); }

  // 提取重音 >
  if (work.includes('>')) { token.isAccent = true; work = work.replace('>', ''); }

  // 提取保持音 -
  if (work.startsWith('-') && work.length > 1) {
    // 检查是保持音还是延音线
    if (work[1] !== '-' && isNaN(parseInt(work[1]))) {
      token.isTenuto = true;
      work = work.slice(1);
    }
  }

  // 提取延长号 ^
  if (work.includes('^')) { token.fermata = true; work = work.replace('^', ''); }

  // 提取力度标记
  const dynMatch = work.match(/-(f{1,2}|p{1,2}|m[fp]|s[fz]|sf[zp])$/);
  if (dynMatch) { token.dynamics = dynMatch[1]; work = work.slice(0, -dynMatch[1].length - 1); }

  // 提取演奏法
  const artMatch = work.match(/\.(tr|trem|arp|gliss|mord|turn)$/);
  if (artMatch) { token.articulation = artMatch[1]; work = work.slice(0, -artMatch[1].length - 1); }

  // 检测高音/低音点
  // 格式1: ˙1 (U+02D9 dot above + number)
  // 格式2: 1̅ (number + combining macron U+0305)
  // 格式3: 1' (number + apostrophe)
  let text = work;

  // 检测 combining macron (高音)
  if (text.includes('̅')) {
    const count = (text.match(/̅/g) || []).length;
    token.octaveDots = count;
    text = text.replace(/̅/g, '');
  }
  // 检测 dot above ˙ (U+02D9)
  const dotAbove = text.match(/^˙+/);
  if (dotAbove) {
    token.octaveDots = dotAbove[0].length;
    text = text.slice(dotAbove[0].length);
  }
  // 检测 apostrophe '
  const apos = text.match(/^'+/) || text.match(/'+$/);
  if (apos) {
    token.octaveDots = (token.octaveDots || 0) + apos[0].length;
    text = text.replace(/'/g, '');
  }
  // 检测低音：text 中的点前缀
  const lowDots = text.match(/^\.+/);
  if (lowDots) {
    token.octaveDots = -lowDots[0].length;
    text = text.slice(lowDots[0].length);
  }

  // 提取附点
  if (text.includes('•')) {
    token.isDot = true;
    text = text.replace('•', '');
  }

  // 提取减时线（下划线）— 标准简谱：
  //   无 = 四分音符 (duration=4)
  //   _  = 八分音符 (duration=8)
  //   __ = 十六分音符 (duration=16)
  //   ___ = 三十二分音符 (duration=32)
  const underMatch = text.match(/_+$/);
  if (underMatch) {
    const uc = underMatch[0].length;
    if (uc >= 3) token.duration = 32;
    else if (uc === 2) token.duration = 16;
    else if (uc === 1) token.duration = 8;
    text = text.slice(0, -uc);
  }

  // 提取连字符（增时线） — 标准简谱约定：
  //   无连字符 → 四分音符 (duration=4，如已匹配减时线则不再改写)
  //   1个连字符 → 二分音符 (duration=2)
  //   2个连字符 → 附点二分音符 (duration=2, isDot=true)
  //   3个及以上 → 全音符 (duration=1)
  const hyphenMatch = text.match(/-+$/);
  if (hyphenMatch && !underMatch) {
    const hyphenCount = hyphenMatch[0].length;
    if (hyphenCount >= 3) token.duration = 1;            // 全音符 1---
    else if (hyphenCount === 2) { token.duration = 2; token.isDot = true; } // 附点二分 1--
    else if (hyphenCount === 1) token.duration = 2;      // 二分音符 1-
    text = text.slice(0, -hyphenCount);
  }

  // 最终清理
  token.pitch = text.replace(/[^\d]/g, '') || '1';

  return token;
}

/* ── 音符显示 ── */

export function noteToDisplay(n: NoteToken): string {
  if (n.isRest) return '0';
  if (n.isExtension) return '—';
  return n.pitch;
}

/**
 * 音符符号映射 — 使用 SMuFL 标准字符（Bravura/Noto Music 字体）
 * 五线谱不同时值的音符使用不同的符头形状：
 *   全音符(1) = 空心椭圆，无符干
 *   二分音符(2) = 空心椭圆 + 符干
 *   四分音符(4) = 实心椭圆 + 符干
 *   八分音符(8) = 实心椭圆 + 符干 + 单符尾
 *   十六分音符(16) = 实心椭圆 + 符干 + 双符尾
 */
export function noteGlyph(n: NoteToken): string {
  if (n.isRest) {
    // 休止符：全休止、二分休止、四分休止、八分休止
    if (n.duration >= 8) return '𝇈';    // 八分休止
    if (n.duration === 4) return '𝄿';   // 四分休止
    if (n.duration === 2) return '𝄾';   // 二分休止
    return '𝄽';                          // 全休止
  }
  if (n.isExtension) return '╌';
  // 音符符头
  if (n.duration === 1) return '𝅝';     // 全音符（空心）
  if (n.duration === 2) return '𝅗𝅥';    // 二分音符（空心+符干）
  if (n.duration === 4) return '♩';     // 四分音符（实心+符干）
  if (n.duration === 8) return '♪';     // 八分音符（实心+符干+尾）
  if (n.duration >= 16) return '𝅘𝅥𝅯';   // 十六分音符（实心+符干+双尾）
  return '♩';
}

/* ── 五线谱 Y 坐标 ── */

const JIANPU_TO_PITCH: Record<string, string> = {
  '1': 'C', '2': 'D', '3': 'E', '4': 'F', '5': 'G', '6': 'A', '7': 'B', '0': 'R',
};

const NOTE_POS: Record<string, number> = {
  C0:0,D0:1,E0:2,F0:3,G0:4,A0:5,B0:6,
  C1:7,D1:8,E1:9,F1:10,G1:11,A1:12,B1:13,
  C2:14,D2:15,E2:16,F2:17,G2:18,A2:19,B2:20,
  C3:21,D3:22,E3:23,F3:24,G3:25,A3:26,B3:27,
  C4:28,D4:29,E4:30,F4:31,G4:32,A4:33,B4:34,
  C5:35,D5:36,E5:37,F5:38,G5:39,A5:40,B5:41,
  C6:42,D6:43,E6:44,F6:45,G6:46,A6:47,B6:48,
  C7:49,D7:50,E7:51,F7:52,G7:53,A7:54,B7:55,
  C8:56,
};

/**
 * 根据小节内音符的同音连线标记，计算跨小节连线信息
 * 查看每小节最后一个音符的 hasTie → 设置 hasTieStart (连线到下一节)
 * 查看每小节第一个音符的 hasTieEnd → 设置 hasTieEnd (从上小节连线过来)
 */
export function computeMeasureTies(measures: ParsedMeasure[]): ParsedMeasure[] {
  return measures.map((m) => {
    let hasTieStart = false;
    let hasTieEnd = false;

    // 仅最后一位非延音音符有 hasTie → 跨小节连线
    const notes = m.notes.filter(n => !n.isExtension);
    const lastIdx = notes.length - 1;
    if (lastIdx >= 0 && notes[lastIdx].hasTie) {
      // 确认下一位（如果有）没有 hasTieEnd 才算是跨小节
      if (lastIdx + 1 >= notes.length || !notes[lastIdx + 1]?.hasTieEnd) {
        hasTieStart = true;
      }
    }

    // 第一个音符有 hasTieEnd → 从上小节连线过来
    if (notes[0]?.hasTieEnd) hasTieEnd = true;

    return { ...m, hasTieStart, hasTieEnd };
  });
}

/**
 * 判断符干朝向
 * 标准：符头在第三线以上（含第三线）→ 符干朝下；符头在第三线以下 → 符干朝上
 * 在我们的坐标中：y 越大音越高，第三线（B4）= y=6
 */
export function noteStemDirection(n: NoteToken): 'up' | 'down' {
  if (n.isRest || n.isExtension) return 'up';
  const y = noteToStaffY(n);
  // 符头在第三线及以上（y>=6）→ 符干朝下，否则朝上
  return y >= 6 ? 'down' : 'up';
}

export function noteToStaffY(n: NoteToken): number {
  if (n.isRest || n.isExtension) return -1;
  const pitchLetter = JIANPU_TO_PITCH[n.pitch] || 'C';
  let octave = 4; // 中音
  if (n.octaveDots >= 2) octave = 6;
  else if (n.octaveDots === 1) octave = 5;
  else if (n.octaveDots === -1) octave = 3;
  else if (n.octaveDots <= -2) octave = 2;

  const key = `${pitchLetter}${octave}`;
  const pos = NOTE_POS[key];
  if (pos === undefined) return 28;
  return pos - 28; // 中央C=0
}
