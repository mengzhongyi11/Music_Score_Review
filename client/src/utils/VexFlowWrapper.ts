/**
 * VexFlow 五线谱记谱规范封装层
 * 基于 GB/T/CY 五线谱记谱规范与简谱五线谱映射规范
 */
import Vex from 'vexflow';
import type {
  StaveNote,
  StaveTie,
  Curve,
  RenderContext,
  Stave,
} from 'vexflow';

const VF = Vex.Flow;

// ============================================================
// 1. 调号 → 七声音阶映射（每个调的 1-7 级音对应的音名）
// ============================================================

const KEY_SCALES: Record<string, string[]> = {
  'C':  ['c', 'd', 'e', 'f', 'g', 'a', 'b'],
  'G':  ['g', 'a', 'b', 'c', 'd', 'e', 'f#'],
  'D':  ['d', 'e', 'f#', 'g', 'a', 'b', 'c#'],
  'A':  ['a', 'b', 'c#', 'd', 'e', 'f#', 'g#'],
  'E':  ['e', 'f#', 'g#', 'a', 'b', 'c#', 'd#'],
  'B':  ['b', 'c#', 'd#', 'e', 'f#', 'g#', 'a#'],
  'F':  ['f', 'g', 'a', 'bb', 'c', 'd', 'e'],
  'Bb': ['bb', 'c', 'd', 'eb', 'f', 'g', 'a'],
  'Eb': ['eb', 'f', 'g', 'ab', 'bb', 'c', 'd'],
  'Ab': ['ab', 'bb', 'c', 'db', 'eb', 'f', 'g'],
  'Db': ['db', 'eb', 'f', 'gb', 'ab', 'bb', 'c'],
  'F#': ['f#', 'g#', 'a#', 'b', 'c#', 'd#', 'e#'],
  'C#': ['c#', 'd#', 'e#', 'f#', 'g#', 'a#', 'b#'],
  'Gb': ['gb', 'ab', 'bb', 'cb', 'db', 'eb', 'f'],
  'Cb': ['cb', 'db', 'eb', 'fb', 'gb', 'ab', 'bb'],
};

const NATURAL_INDEX: Record<string, number> = {
  'c': 0, 'd': 1, 'e': 2, 'f': 3, 'g': 4, 'a': 5, 'b': 6,
};

/**
 * 简谱数字 → VexFlow 音高 key 转换（调号感知）
 *
 * 根据映射规范 §2-§3：
 * - 简谱数字 1-7 是调内音级，1 = 主音（do）
 * - 无八度点 = 中央八度（小字一组，octave 4）
 * - 高音点 = 八度+1，低音点 = 八度-1
 *
 * @param key      调号，如 "C", "G", "Bb"
 * @param pitch    简谱数字 "1"-"7"
 * @param octaveDots 八度点偏移（0=本位, 1=高音点, -1=低音点）
 * @param accidental  临时变音号 "#", "b", "n"
 * @returns VexFlow key 如 "g/4", "d/5", "f#/5"
 *
 * 示例：
 *   jianpuToVexflowKey("G", "1", 0) → "g/4"    (G大调 do = G4)
 *   jianpuToVexflowKey("G", "5", 0) → "d/5"    (G大调 sol = D5)
 *   jianpuToVexflowKey("G", "1", 1) → "g/5"    (G大调高音 do = G5)
 *   jianpuToVexflowKey("C", "1", 0) → "c/4"    (C大调 do = C4)
 */
/**
 * 规范化调号名称
 * 简谱记法 → VexFlow 记法：bE → Eb, bB → Bb, c → C, #F → F#
 */
function normalizeKey(raw: string): string {
  let k = raw.trim();
  // 小写转大写
  if (k.length === 1) return k.toUpperCase();
  // bE → Eb, #F → F# (中西记法转换)
  if (/^[b#][A-Ga-g]$/.test(k)) {
    k = k[1].toUpperCase() + k[0];
  }
  return k;
}

export function jianpuToVexflowKey(
  key: string,
  pitch: string,
  octaveDots: number = 0,
  accidental?: string,
): string {
  const normalizedKey = normalizeKey(key);
  const scale = KEY_SCALES[normalizedKey] || KEY_SCALES['C'];
  const degree = parseInt(pitch) - 1; // 0-based
  if (degree < 0 || degree >= scale.length) return 'c/4';

  const noteName = scale[degree];
  // 分离纯音名与调内变音（不能使用 /[#b]/g regex，因为 'b' 音名字母会被误删）
  const baseNote = noteName.length === 1 ? noteName : noteName[0];
  const scaleAccidental = noteName.length > 1
    ? (noteName.includes('#') ? '#' : 'b')
    : '';

  // 计算八度：主音从 octave 4 开始，音符跨越 C→D 边界时 octave+1
  let octave = 4;
  for (let i = 1; i <= degree; i++) {
    const prevFull = scale[i - 1];
    const currFull = scale[i];
    const prevNote = prevFull.length === 1 ? prevFull : prevFull[0];
    const currNote = currFull.length === 1 ? currFull : currFull[0];
    const prevIdx = NATURAL_INDEX[prevNote] ?? 0;
    const currIdx = NATURAL_INDEX[currNote] ?? 0;
    if (currIdx <= prevIdx) octave++;
  }

  octave += octaveDots;

  // 外部变音号优先于调内变音
  const finalAcc = accidental || scaleAccidental;

  return `${baseNote}${finalAcc}/${octave}`;
}

// ============================================================
// 2. 时值映射
// ============================================================

export const DURATION_MAP = {
  whole: 'w', half: 'h', quarter: 'q', eighth: '8',
  sixteenth: '16', thirtysecond: '32', sixtyfourth: '64',
  wholeDotted: 'wd', halfDotted: 'hd', quarterDotted: 'qd',
  eighthDotted: '8d', sixteenthDotted: '16d',
  wholeDoubleDotted: 'wdd', halfDoubleDotted: 'hdd', quarterDoubleDotted: 'qdd',
  wholeRest: 'wr', halfRest: 'hr', quarterRest: 'qr',
  eighthRest: '8r', sixteenthRest: '16r', thirtysecondRest: '32r',
} as const;

export const ACCIDENTAL_TYPES = {
  sharp: '#', flat: 'b', natural: 'n',
  doubleSharp: '##', doubleFlat: 'bb',
} as const;

export const ARTICULATION_TYPES = {
  staccato: 'a.', accent: 'a>', tenuto: 'a-',
  marcato: 'a^', fermata: 'a@a',
} as const;

// ============================================================
// 3. 音符构建器（NoteBuilder）
// ============================================================

export class NoteBuilder {
  private config: {
    keys: string[];
    duration: string;
    clef: string;
    autoStem: boolean;
    stemDirection?: number;
  };
  private articulations: string[] = [];
  private ornaments: string[] = [];

  constructor(config: {
    keys: string[];
    duration: string;
    clef?: string;
    autoStem?: boolean;
    stemDirection?: number;
  }) {
    this.config = { clef: 'treble', autoStem: true, ...config };
  }

  addArticulation(type: string): this {
    this.articulations.push(type);
    return this;
  }

  addOrnament(type: string): this {
    this.ornaments.push(type);
    return this;
  }

  build(): StaveNote {
    const note = new VF.StaveNote({
      clef: this.config.clef,
      keys: this.config.keys,
      duration: this.config.duration,
      auto_stem: this.config.autoStem,
      stem_direction: this.config.stemDirection,
    });

    // 应用演奏法
    for (const art of this.articulations) {
      note.addModifier(new VF.Articulation(art), 0);
    }

    // 应用装饰音
    for (const orn of this.ornaments) {
      note.addModifier(new VF.Ornament(orn), 0);
    }

    return note;
  }
}

// ============================================================
// 4. 小节构建器（MeasureBuilder）
// ============================================================

export class MeasureBuilder {
  private notes: StaveNote[] = [];
  private ties: StaveTie[] = [];
  private slurs: Curve[] = [];
  private config: {
    x: number;
    y: number;
    width: number;
    timeSignature?: string;
    keySignature?: string;
    clef: string;
    isFirstMeasure: boolean;
    spacing: number; // 五线间距（默认13=增大1/3）
  };

  constructor(config: {
    x: number;
    y: number;
    width: number;
    timeSignature?: string;
    keySignature?: string;
    clef?: string;
    isFirstMeasure?: boolean;
    spacing?: number;
  }) {
    this.config = { clef: 'treble', isFirstMeasure: false, spacing: 10, ...config };
  }

  addNote(note: StaveNote): this {
    this.notes.push(note);
    return this;
  }

  addNotes(notes: StaveNote[]): this {
    this.notes.push(...notes);
    return this;
  }

  addTie(startIdx: number, endIdx: number): this {
    if (this.notes[startIdx] && this.notes[endIdx]) {
      this.ties.push(
        new VF.StaveTie({
          first_note: this.notes[startIdx],
          last_note: this.notes[endIdx],
        }),
      );
    }
    return this;
  }

  addSlur(startIdx: number, endIdx: number): this {
    if (this.notes[startIdx] && this.notes[endIdx]) {
      this.slurs.push(
        new VF.Curve(this.notes[startIdx], this.notes[endIdx], {
          cps: [{ x: 0, y: 10 }, { x: 0, y: 10 }],
          y_shift: 10,
        }),
      );
    }
    return this;
  }

  render(ctx: RenderContext): Stave {
    const stave = new VF.Stave(this.config.x, this.config.y, this.config.width, {
      spacing_between_lines_px: this.config.spacing,
    });

    // 第一小节（或新行首小节）显示谱号、调号、拍号
    if (this.config.isFirstMeasure) {
      stave.addClef(this.config.clef);
      if (this.config.keySignature) {
        stave.addKeySignature(this.config.keySignature);
      }
      if (this.config.timeSignature) {
        stave.addTimeSignature(this.config.timeSignature);
      }
    }

    stave.setContext(ctx).draw();

    // 从拍号解析实际的 beats/beat_value
    const [numBeats, beatValue] = this.parseTimeSignature();

    const voice = new VF.Voice({
      num_beats: numBeats,
      beat_value: beatValue,
    });
    // SOFT 模式：允许小节内时值不完全填满或略超，避免因简谱简化数据导致异常
    voice.setMode(2); // VF.Voice.Mode.SOFT
    voice.addTickables(this.notes);

    new VF.Formatter()
      .joinVoices([voice])
      .format([voice], this.config.width - 20);

    voice.draw(ctx, stave);

    // 绘制连音线
    for (const tie of this.ties) {
      tie.setContext(ctx).draw();
    }
    for (const slur of this.slurs) {
      slur.setContext(ctx).draw();
    }

    return stave;
  }

  private parseTimeSignature(): [number, number] {
    if (!this.config.timeSignature) return [4, 4];
    const parts = this.config.timeSignature.split('/');
    const numBeats = parseInt(parts[0]) || 4;
    const beatValue = parseInt(parts[1]) || 4;
    return [numBeats, beatValue];
  }
}

// ============================================================
// 导出 VexFlow 引用
// ============================================================

export { VF, Vex };
