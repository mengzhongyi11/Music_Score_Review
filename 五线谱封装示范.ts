/**
 * VexFlow 五线谱记谱规范封装层
 * 支持 GB/T/CY 五线谱记谱规范全部符号
 * 
 * 使用方式:
 * import { NotationRenderer, NoteBuilder, MeasureBuilder } from './VexFlowWrapper';
 */

import Vex from 'vexflow';

const VF = Vex.Flow;

// ============================================================
// 1. 基础配置与常量定义（对应规范第5-6章）
// ============================================================

/**
 * 音符时值映射（规范第6章 2节）
 */
export const DURATION_MAP = {
  // 基本时值
  whole: 'w',           // 全音符
  half: 'h',            // 二分音符
  quarter: 'q',         // 四分音符
  eighth: '8',          // 八分音符
  sixteenth: '16',      // 十六分音符
  thirtysecond: '32',   // 三十二分音符
  sixtyfourth: '64',    // 六十四分音符

  // 附点时值
  wholeDotted: 'wd',    // 附点全音符
  halfDotted: 'hd',     // 附点二分音符
  quarterDotted: 'qd',  // 附点四分音符
  eighthDotted: '8d',   // 附点八分音符
  sixteenthDotted: '16d', // 附点十六分音符

  // 双附点时值
  wholeDoubleDotted: 'wdd',
  halfDoubleDotted: 'hdd',
  quarterDoubleDotted: 'qdd',

  // 休止符
  wholeRest: 'wr',      // 全休止符
  halfRest: 'hr',       // 二分休止符
  quarterRest: 'qr',    // 四分休止符
  eighthRest: '8r',     // 八分休止符
  sixteenthRest: '16r', // 十六分休止符
  thirtysecondRest: '32r', // 三十二分休止符
} as const;

/**
 * 谱号类型（规范第6章 4节 5.谱号）
 */
export const CLEF_TYPES = {
  treble: 'treble',      // 高音谱号（G谱号）
  bass: 'bass',          // 低音谱号（F谱号）
  alto: 'alto',          // 中音谱号（C谱号第三线）
  tenor: 'tenor',        // 次中音谱号（C谱号第四线）
  soprano: 'soprano',    // 女高音谱号
  mezzoSoprano: 'mezzo-soprano', // 女中音谱号
  baritone: 'baritone',  // 上男中音谱号
  percussion: 'percussion', // 打击乐谱号
  tab: 'tab',            // 吉他六线谱
} as const;

/**
 * 调号映射（规范第6章 4节 8.调号）
 */
export const KEY_SIGNATURES = [
  'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#',  // 升号调
  'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'      // 降号调
] as const;

/**
 * 变音记号类型（规范第6章 4节 6.变音号）
 */
export const ACCIDENTAL_TYPES = {
  sharp: '#',           // 升号 ♯
  flat: 'b',            // 降号 ♭
  natural: 'n',         // 还原号 ♮
  doubleSharp: '##',    // 重升号 𝄪
  doubleFlat: 'bb',     // 重降号 𝄫
} as const;

/**
 * 演奏法符号（规范第7章 9节）
 */
export const ARTICULATION_TYPES = {
  staccato: 'a.',       // 断音 ·
  accent: 'a>',         // 重音 >
  tenuto: 'a-',         // 保持音 —
  marcato: 'a^',        // 强音 ^
  staccatissimo: 'av',  // 极断音 ▼
  spiccato: 'as',       // 跳弓
  fermata: 'a@a',       // 延长号 𝄐
  mordent: 'am',        // 波音
  turn: 'a\',           // 回音
  upBow: 'a|',          // 上弓
  downBow: 'am',        // 下弓
} as const;

/**
 * 装饰音类型（规范第7章 5节）
 */
export const ORNAMENT_TYPES = {
  trill: 'tr',          // 颤音 tr
  turn: 'turn',         // 回音
  invertedTurn: 'turn_inverted', // 逆回音
  mordent: 'mordent',   // 短波音
  invertedMordent: 'mordent_inverted', // 逆短波音
} as const;

// ============================================================
// 2. 音符构建器（NoteBuilder）
// ============================================================

export interface NoteConfig {
  keys: string[];                    // 音高，如 ["c/4", "e/4", "g/4"]
  duration: keyof typeof DURATION_MAP; // 时值
  clef?: string;                     // 谱号
  autoStem?: boolean;                // 自动符干方向
  stemDirection?: number;            // 符干方向 (VF.Stem.UP / VF.Stem.DOWN)
}

export class NoteBuilder {
  private config: NoteConfig;
  private modifiers: any[] = [];
  private articulations: string[] = [];
  private ornaments: string[] = [];

  constructor(config: NoteConfig) {
    this.config = {
      clef: 'treble',
      autoStem: true,
      ...config
    };
  }

  /**
   * 添加变音记号（规范第6章 4节 6.变音号）
   */
  addAccidental(noteIndex: number, type: keyof typeof ACCIDENTAL_TYPES): this {
    this.modifiers.push({
      type: 'accidental',
      noteIndex,
      accidental: ACCIDENTAL_TYPES[type]
    });
    return this;
  }

  /**
   * 添加演奏法符号（规范第7章 9节）
   */
  addArticulation(type: keyof typeof ARTICULATION_TYPES): this {
    this.articulations.push(ARTICULATION_TYPES[type]);
    return this;
  }

  /**
   * 添加装饰音（规范第7章 5节）
   */
  addOrnament(type: keyof typeof ORNAMENT_TYPES): this {
    this.ornaments.push(ORNAMENT_TYPES[type]);
    return this;
  }

  /**
   * 添加附点（规范第6章 5节 5.附点）
   * VexFlow 自动处理，duration 已包含 d/dd
   */
  addDot(): this {
    // 附点通过 duration 字符串控制，此处仅作标记
    return this;
  }

  /**
   * 添加歌词（规范第7章 8节）
   */
  addLyric(text: string, verse: number = 0): this {
    this.modifiers.push({
      type: 'lyric',
      text,
      verse
    });
    return this;
  }

  /**
   * 构建 VexFlow StaveNote
   */
  build(): VF.StaveNote {
    const vfDuration = DURATION_MAP[this.config.duration];

    const note = new VF.StaveNote({
      clef: this.config.clef,
      keys: this.config.keys,
      duration: vfDuration,
      auto_stem: this.config.autoStem,
      stem_direction: this.config.stemDirection
    });

    // 添加变音记号
    this.modifiers.forEach(mod => {
      if (mod.type === 'accidental') {
        note.addModifier(new VF.Accidental(mod.accidental), mod.noteIndex);
      }
    });

    // 添加演奏法
    this.articulations.forEach(art => {
      note.addModifier(new VF.Articulation(art));
    });

    // 添加装饰音
    this.ornaments.forEach(orn => {
      note.addModifier(new VF.Ornament(orn));
    });

    // 添加附点（VexFlow 自动处理，但需显式调用以支持多附点）
    if (this.config.duration.includes('dd')) {
      note.addDotToAll();
      note.addDotToAll(); // 双附点
    } else if (this.config.duration.includes('d')) {
      note.addDotToAll();
    }

    return note;
  }
}

// ============================================================
// 3. 小节构建器（MeasureBuilder）
// ============================================================

export interface MeasureConfig {
  x: number;
  y: number;
  width: number;
  timeSignature?: string;     // 拍号，如 "4/4"
  keySignature?: string;      // 调号，如 "G"
  clef?: string;              // 谱号
  showClef?: boolean;         // 是否显示谱号
  showTimeSig?: boolean;      // 是否显示拍号
  showKeySig?: boolean;       // 是否显示调号
  isFirstMeasure?: boolean;   // 是否第一小节
}

export class MeasureBuilder {
  private config: MeasureConfig;
  private notes: VF.StaveNote[] = [];
  private ties: VF.StaveTie[] = [];
  private slurs: VF.Curve[] = [];
  private tuplets: VF.Tuplet[] = [];
  private texts: VF.StaveText[] = [];

  constructor(config: MeasureConfig) {
    this.config = {
      clef: 'treble',
      showClef: false,
      showTimeSig: false,
      showKeySig: false,
      isFirstMeasure: false,
      ...config
    };
  }

  /**
   * 添加音符
   */
  addNote(note: VF.StaveNote): this {
    this.notes.push(note);
    return this;
  }

  /**
   * 添加多个音符
   */
  addNotes(notes: VF.StaveNote[]): this {
    this.notes.push(...notes);
    return this;
  }

  /**
   * 添加延音线（规范第6章 5节 6.延音线）
   * Tie：连接相同音高，时值相加
   */
  addTie(startNoteIndex: number, endNoteIndex: number): this {
    const tie = new VF.StaveTie({
      first_note: this.notes[startNoteIndex],
      last_note: this.notes[endNoteIndex],
    });
    this.ties.push(tie);
    return this;
  }

  /**
   * 添加连音线/圆滑线（规范第7章 10节）
   * Slur：连接不同音高，圆滑演奏
   */
  addSlur(startNoteIndex: number, endNoteIndex: number): this {
    const slur = new VF.Curve(
      this.notes[startNoteIndex],
      this.notes[endNoteIndex],
      {
        cps: [{x: 0, y: 10}, {x: 0, y: 10}],
        y_shift: 10,
        invert: false
      }
    );
    this.slurs.push(slur);
    return this;
  }

  /**
   * 添加连音符（规范第6章 5节 9.连音符）
   * 三连音、五连音等
   */
  addTuplet(
    startIndex: number, 
    endIndex: number, 
    options: { numNotes: number; notesOccupied: number; ratioed?: boolean }
  ): this {
    const tupletNotes = this.notes.slice(startIndex, endIndex + 1);
    const tuplet = new VF.Tuplet(tupletNotes, {
      num_notes: options.numNotes,
      notes_occupied: options.notesOccupied,
      ratioed: options.ratioed || false
    });
    this.tuplets.push(tuplet);
    return this;
  }

  /**
   * 添加小节内文本（力度、速度等）
   */
  addText(text: string, position: number): this {
    const staveText = new VF.StaveText(this.buildStave(), text, position);
    this.texts.push(staveText);
    return this;
  }

  /**
   * 构建 Stave（五线谱）
   */
  private buildStave(): VF.Stave {
    const stave = new VF.Stave(
      this.config.x,
      this.config.y,
      this.config.width
    );

    // 第一小节或需要时显示谱号
    if (this.config.showClef || this.config.isFirstMeasure) {
      stave.addClef(this.config.clef!);
    }

    // 第一小节或需要时显示调号
    if (this.config.showKeySig || this.config.isFirstMeasure) {
      if (this.config.keySignature) {
        stave.addKeySignature(this.config.keySignature);
      }
    }

    // 第一小节或需要时显示拍号
    if (this.config.showTimeSig || this.config.isFirstMeasure) {
      if (this.config.timeSignature) {
        stave.addTimeSignature(this.config.timeSignature);
      }
    }

    return stave;
  }

  /**
   * 渲染小节
   */
  render(context: VF.RenderContext): VF.Stave {
    const stave = this.buildStave();
    stave.setContext(context).draw();

    // 创建 Voice
    const voice = new VF.Voice({
      num_beats: this.getBeatCount(),
      beat_value: this.getBeatValue()
    });
    voice.addTickables(this.notes);

    // 格式化
    const formatter = new VF.Formatter();
    formatter.joinVoices([voice]).format([voice], this.config.width - 20);

    // 绘制
    voice.draw(context, stave);

    // 绘制延音线
    this.ties.forEach(tie => tie.setContext(context).draw());

    // 绘制连音线
    this.slurs.forEach(slur => slur.setContext(context).draw());

    // 绘制连音符
    this.tuplets.forEach(tuplet => tuplet.setContext(context).draw());

    return stave;
  }

  /**
   * 获取拍数（从拍号解析）
   */
  private getBeatCount(): number {
    if (!this.config.timeSignature) return 4;
    return parseInt(this.config.timeSignature.split('/')[0]);
  }

  /**
   * 获取拍值（从拍号解析）
   */
  private getBeatValue(): number {
    if (!this.config.timeSignature) return 4;
    return parseInt(this.config.timeSignature.split('/')[1]);
  }
}

// ============================================================
// 4. 反复记号系统（规范第5章 10节）
// ============================================================

export interface RepeatConfig {
  type: 'start' | 'end' | 'segno' | 'coda' | 'dc' | 'ds' | 'fine';
  volta?: number;           // 跳越号数字（第1、2结尾）
  text?: string;            // 文字说明
}

export class RepeatSymbol {
  /**
   * 创建段落反复号（𝄇 / 𝄆）
   */
  static createRepeatBarline(type: 'start' | 'end' | 'both'): VF.Barline {
    const barlineType = {
      start: VF.Barline.type.REPEAT_BEGIN,
      end: VF.Barline.type.REPEAT_END,
      both: VF.Barline.type.REPEAT_BOTH
    }[type];

    return new VF.Barline(barlineType);
  }

  /**
   * 创建跳越号（第1、2结尾）
   * VexFlow 原生不支持，需自定义绘制
   */
  static createVolta(number: number, x: number, y: number, width: number): any {
    // 返回自定义绘制函数
    return (ctx: VF.RenderContext) => {
      ctx.save();
      ctx.setFillStyle('black');
      ctx.setStrokeStyle('black');
      ctx.setLineWidth(1.5);

      // 绘制方框
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + width, y);
      ctx.lineTo(x + width, y + 12);
      ctx.lineTo(x, y + 12);
      ctx.closePath();
      ctx.stroke();

      // 绘制数字
      ctx.setFont('Arial', 10, 'bold');
      ctx.fillText(number.toString(), x + width/2 - 3, y + 10);

      ctx.restore();
    };
  }

  /**
   * 创建 D.C. / D.S. / Fine 文本
   */
  static createRepeatText(text: string, x: number, y: number): any {
    return (ctx: VF.RenderContext) => {
      ctx.save();
      ctx.setFont('Times New Roman', 14, 'bold');
      ctx.setFillStyle('black');
      ctx.fillText(text, x, y);
      ctx.restore();
    };
  }
}

// ============================================================
// 5. 谱表系统（规范第5章 5节）
// ============================================================

export interface StaffSystemConfig {
  x: number;
  y: number;
  width: number;
  staves: StaffConfig[];
  bracket?: boolean;        // 是否添加花连谱号
}

export interface StaffConfig {
  clef: string;
  keySignature?: string;
  timeSignature?: string;
  instrumentName?: string;  // 声部名称
}

export class StaffSystem {
  private config: StaffSystemConfig;
  private staves: VF.Stave[] = [];
  private connectors: VF.StaveConnector[] = [];

  constructor(config: StaffSystemConfig) {
    this.config = config;
  }

  /**
   * 构建大谱表（Grand Staff）
   * 钢琴谱：高音谱号 + 低音谱号 + 花连谱号
   */
  buildGrandStaff(): this {
    const staveGap = 80;

    this.config.staves.forEach((staffConfig, index) => {
      const stave = new VF.Stave(
        this.config.x,
        this.config.y + index * staveGap,
        this.config.width
      );

      stave.addClef(staffConfig.clef);
      if (staffConfig.keySignature) {
        stave.addKeySignature(staffConfig.keySignature);
      }
      if (staffConfig.timeSignature) {
        stave.addTimeSignature(staffConfig.timeSignature);
      }

      this.staves.push(stave);
    });

    // 添加花连谱号（Brace）
    if (this.config.bracket && this.staves.length >= 2) {
      const brace = new VF.StaveConnector(
        this.staves[0],
        this.staves[this.staves.length - 1]
      );
      brace.setType(VF.StaveConnector.type.BRACE);
      this.connectors.push(brace);
    }

    // 添加连谱线
    for (let i = 0; i < this.staves.length - 1; i++) {
      const line = new VF.StaveConnector(this.staves[i], this.staves[i + 1]);
      line.setType(VF.StaveConnector.type.SINGLE);
      this.connectors.push(line);
    }

    return this;
  }

  /**
   * 渲染谱表系统
   */
  render(context: VF.RenderContext): void {
    this.staves.forEach(stave => stave.setContext(context).draw());
    this.connectors.forEach(conn => conn.setContext(context).draw());
  }

  /**
   * 获取所有 Stave 实例
   */
  getStaves(): VF.Stave[] {
    return this.staves;
  }
}

// ============================================================
// 6. 高级符号系统（规范第7章）
// ============================================================

export class AdvancedSymbols {
  /**
   * 绘制延长号（Fermata）
   * 规范第6章 5节 7.延长号
   */
  static drawFermata(ctx: VF.RenderContext, x: number, y: number, inverted: boolean = false): void {
    ctx.save();
    ctx.setFillStyle('black');
    ctx.setStrokeStyle('black');
    ctx.setLineWidth(1.2);

    // 绘制圆点
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();

    // 绘制弧线
    ctx.beginPath();
    if (inverted) {
      ctx.arc(x, y + 5, 8, Math.PI, 0);
    } else {
      ctx.arc(x, y - 5, 8, 0, Math.PI);
    }
    ctx.stroke();

    ctx.restore();
  }

  /**
   * 绘制八度记号（8va / 8vb）
   * 规范第6章 4节 7.八度号
   */
  static drawOctaveShift(
    ctx: VF.RenderContext, 
    x: number, 
    y: number, 
    type: '8va' | '8vb', 
    length: number
  ): void {
    ctx.save();
    ctx.setFont('Arial', 12, 'bold');
    ctx.setFillStyle('black');
    ctx.setStrokeStyle('black');
    ctx.setLineWidth(1);

    // 绘制文字
    ctx.fillText(type, x, y);

    // 绘制虚线
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    if (type === '8va') {
      ctx.moveTo(x + 20, y - 2);
      ctx.lineTo(x + length, y - 2);
    } else {
      ctx.moveTo(x + 20, y + 2);
      ctx.lineTo(x + length, y + 2);
    }
    ctx.stroke();

    ctx.restore();
  }

  /**
   * 绘制琶音符号（竖波浪线）
   * 规范第7章 7节
   */
  static drawArpeggio(ctx: VF.RenderContext, x: number, y: number, height: number): void {
    ctx.save();
    ctx.setStrokeStyle('black');
    ctx.setLineWidth(1.2);

    const waveWidth = 6;
    const waveHeight = 4;
    const numWaves = Math.floor(height / waveHeight);

    ctx.beginPath();
    for (let i = 0; i < numWaves; i++) {
      const startY = y + i * waveHeight;
      if (i % 2 === 0) {
        ctx.moveTo(x, startY);
        ctx.quadraticCurveTo(x + waveWidth/2, startY - waveHeight/2, x + waveWidth, startY + waveHeight/2);
      } else {
        ctx.moveTo(x + waveWidth, startY);
        ctx.quadraticCurveTo(x + waveWidth/2, startY + waveHeight/2, x, startY + waveHeight/2);
      }
    }
    ctx.stroke();

    ctx.restore();
  }

  /**
   * 绘制震音（斜线）
   * 规范第7章 8节
   */
  static drawTremolo(
    ctx: VF.RenderContext, 
    x: number, 
    y: number, 
    numStrokes: number, 
    angle: number = -30
  ): void {
    ctx.save();
    ctx.setStrokeStyle('black');
    ctx.setLineWidth(1.5);

    const strokeLength = 12;
    const gap = 4;

    for (let i = 0; i < numStrokes; i++) {
      const offsetY = i * gap;
      ctx.beginPath();
      ctx.moveTo(x, y + offsetY);
      ctx.lineTo(x + strokeLength, y + offsetY);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * 绘制滑奏线（Glissando）
   * 规范第7章 6节
   */
  static drawGlissando(ctx: VF.RenderContext, x1: number, y1: number, x2: number, y2: number): void {
    ctx.save();
    ctx.setStrokeStyle('black');
    ctx.setLineWidth(1);
    ctx.setLineDash([2, 2]);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // 绘制文字 "gliss."
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    ctx.setFont('Arial', 10, 'italic');
    ctx.setFillStyle('black');
    ctx.fillText('gliss.', midX - 10, midY);

    ctx.restore();
  }
}

// ============================================================
// 7. 主渲染器（NotationRenderer）
// ============================================================

export interface RendererConfig {
  elementId: string;        // DOM 元素 ID
  width: number;
  height: number;
  backend?: 'svg' | 'canvas';
}

export class NotationRenderer {
  private renderer: VF.Renderer;
  private context: VF.RenderContext;
  private measures: MeasureBuilder[] = [];

  constructor(config: RendererConfig) {
    const backend = config.backend === 'canvas' 
      ? VF.Renderer.Backends.CANVAS 
      : VF.Renderer.Backends.SVG;

    this.renderer = new VF.Renderer(config.elementId, backend);
    this.renderer.resize(config.width, config.height);
    this.context = this.renderer.getContext();
  }

  /**
   * 添加小节
   */
  addMeasure(measure: MeasureBuilder): this {
    this.measures.push(measure);
    return this;
  }

  /**
   * 渲染所有内容
   */
  render(): void {
    this.measures.forEach(measure => measure.render(this.context));
  }

  /**
   * 获取渲染上下文（用于自定义绘制）
   */
  getContext(): VF.RenderContext {
    return this.context;
  }

  /**
   * 导出 SVG 字符串（仅 SVG backend）
   */
  exportSVG(): string {
    const element = document.getElementById(this.renderer.elementId);
    if (element) {
      const svg = element.querySelector('svg');
      return svg ? svg.outerHTML : '';
    }
    return '';
  }

  /**
   * 清空画布
   */
  clear(): void {
    this.context.clear();
    this.measures = [];
  }
}

// ============================================================
// 8. 使用示例
// ============================================================

/*
// 示例：渲染 G大调弦乐小夜曲第一乐章开头
const renderer = new NotationRenderer({
  elementId: 'notation-container',
  width: 900,
  height: 200,
  backend: 'svg'
});

// 创建第一小节
const measure1 = new MeasureBuilder({
  x: 10,
  y: 40,
  width: 200,
  timeSignature: '4/4',
  keySignature: 'G',
  clef: 'treble',
  isFirstMeasure: true
});

// 添加音符：G4 四分音符
const note1 = new NoteBuilder({
  keys: ['g/4'],
  duration: 'quarter'
}).build();

// 添加附点四分音符 D5
const note2 = new NoteBuilder({
  keys: ['d/5'],
  duration: 'quarterDotted'
}).build();

// 添加八分音符 B4
const note3 = new NoteBuilder({
  keys: ['b/4'],
  duration: 'eighth'
}).build();

// 添加四分音符 G4（带重音）
const note4 = new NoteBuilder({
  keys: ['g/4'],
  duration: 'quarter'
}).addArticulation('accent').build();

measure1
  .addNotes([note1, note2, note3, note4])
  .addTie(0, 3);  // 跨小节延音线

renderer.addMeasure(measure1).render();
*/

// ============================================================
// 导出
// ============================================================

export {
  VF,
  Vex
};