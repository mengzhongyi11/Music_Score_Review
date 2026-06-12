/**
 * 简谱音频播放引擎
 * 将简谱音符实时合成为钢琴音色播放
 */
import { jianpuToVexflowKey } from './VexFlowWrapper';

/* ── 音符 → 频率映射 ── */

const NOTE_TO_MIDI: Record<string, number> = {
  'c': 0, 'c#': 1, 'db': 1, 'd': 2, 'd#': 3, 'eb': 3,
  'e': 4, 'f': 5, 'f#': 6, 'gb': 6, 'g': 7, 'g#': 8,
  'ab': 8, 'a': 9, 'a#': 10, 'bb': 10, 'b': 11,
};

function vfKeyToMidi(vfKey: string): number {
  const [note, octStr] = vfKey.split('/');
  const octave = parseInt(octStr) || 4;
  // 分离音名和升降号
  const baseNote = note[0].toLowerCase();
  const accidental = note.length > 1 ? note.slice(1) : '';
  const key = baseNote + accidental;
  const semitone = NOTE_TO_MIDI[key] ?? 0;
  return (octave + 1) * 12 + semitone;
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/* ── 播放事件 ── */

export interface PlayEvent {
  freq: number;        // 频率 Hz
  startBeat: number;   // 起始拍（从 0 开始）
  duration: number;    // 时值（拍数）
  amplitude: number;   // 音量 0-1
}

interface ParseOptions {
  key: string;
  pitch: string;
  octaveDots: number;
  accidental?: string;
  duration: number;
  isDot: boolean;
  isRest: boolean;
  isExtension: boolean;
}

/**
 * 解析 parsed 数据为播放事件列表
 */
export function parseToPlayEvents(
  measures: { notes: ParseOptions[] }[],
  key: string,
  bpm: number = 120,
): PlayEvent[] {
  const events: PlayEvent[] = [];
  let currentBeat = 0;

  for (const measure of measures) {
    for (const note of measure.notes) {
      if (note.isRest || note.isExtension) {
        const beats = (4 / (note.isRest ? Math.max(note.duration, 4) : note.duration)) * (note.isDot ? 1.5 : 1);
        currentBeat += beats;
        continue;
      }

      const vfKey = jianpuToVexflowKey(key, note.pitch, note.octaveDots, note.accidental);
      const midi = vfKeyToMidi(vfKey);
      const freq = midiToFrequency(midi);
      const beats = (4 / note.duration) * (note.isDot ? 1.5 : 1);

      events.push({
        freq,
        startBeat: currentBeat,
        duration: beats,
        amplitude: 0.6,
      });

      currentBeat += beats;
    }
  }

  return events;
}

/* ── 音色合成 ── */

class Synth {
  private ctx: AudioContext | null = null;

  ensureContext() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /** 钢琴音色：基频 + 多个泛音 + 包络 */
  playNote(ctx: AudioContext, freq: number, startTime: number, duration: number, amplitude: number) {
    const sampleRate = ctx.sampleRate;
    const totalSamples = Math.floor(duration * sampleRate);
    const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
    const data = buffer.getChannelData(0);

    // 泛音列（钢琴音色近似）
    const harmonics = [
      { mult: 1,   gain: 1.0 },  // 基频
      { mult: 2,   gain: 0.5 },  // 八度
      { mult: 3,   gain: 0.3 },  // 十二度
      { mult: 4,   gain: 0.2 },  // 双八度
      { mult: 5,   gain: 0.1 },  // 十七度
      { mult: 6,   gain: 0.06 },
      { mult: 8,   gain: 0.03 },
    ];

    // 包络参数
    const attackTime = Math.min(0.02, duration * 0.05);
    const releaseTime = Math.min(0.08, duration * 0.15);
    const attackSamples = Math.floor(attackTime * sampleRate);
    const releaseSamples = Math.floor(releaseTime * sampleRate);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      let sample = 0;

      // 合成泛音
      for (const h of harmonics) {
        sample += Math.sin(2 * Math.PI * freq * h.mult * t) * h.gain;
      }

      // 归一化
      const totalGain = harmonics.reduce((s, h) => s + h.gain, 0);
      sample /= totalGain;

      // 包络
      let env = 1;
      if (i < attackSamples) {
        env = i / attackSamples; // Attack
      } else if (i > totalSamples - releaseSamples) {
        env = (totalSamples - i) / releaseSamples; // Release
      }
      // Sustain: 缓慢衰减
      const sustain = Math.max(0.3, 1 - (i / totalSamples) * 0.7);

      data[i] = sample * env * sustain * amplitude * 0.5;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.5;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(startTime);
  }

  /** 停止所有声音 */
  stop() {
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}

export const synth = new Synth();

/* ── 播放器 ── */

export type PlayerState = 'idle' | 'playing' | 'paused';

export class Player {
  private synth = synth;
  private events: PlayEvent[] = [];
  private bpm: number = 120;
  /** 用 performance.now() 基准记录开始时间（ms） */
  private startPerf: number = 0;
  /** 已暂停累计时长（秒） */
  private pausedElapsed: number = 0;
  private state: PlayerState = 'idle';
  private timerId: number | null = null;
  private onProgress: ((beat: number) => void) | null = null;
  private onStateChange: ((state: PlayerState) => void) | null = null;

  load(events: PlayEvent[], bpm: number) {
    this.stop();
    this.events = events;
    this.bpm = bpm;
    this.pausedElapsed = 0;
  }

  get totalDuration(): number {
    if (this.events.length === 0) return 0;
    const last = this.events[this.events.length - 1];
    return (last.startBeat + last.duration) * 60 / this.bpm;
  }

  get currentState(): PlayerState {
    return this.state;
  }

  onProgressChange(cb: (beat: number) => void) {
    this.onProgress = cb;
  }

  onStatusChange(cb: (state: PlayerState) => void) {
    this.onStateChange = cb;
  }

  /** 获取当前已播放时长（秒） */
  private getElapsed(): number {
    if (this.state === 'idle') return 0;
    if (this.state === 'paused') return this.pausedElapsed;
    return (performance.now() - this.startPerf) / 1000 + this.pausedElapsed;
  }

  play() {
    if (this.state === 'playing') return;
    if (this.events.length === 0) return;

    if (this.state === 'paused') {
      this.state = 'playing';
      this.onStateChange?.('playing');
      this.startPerf = performance.now();

      const offset = this.pausedElapsed;
      const ctx = this.synth.ensureContext();
      const audioNow = ctx.currentTime;
      for (const e of this.events) {
        const eventTime = e.startBeat * 60 / this.bpm;
        if (eventTime < offset) continue; // 跳过已播部分
        this.synth.playNote(ctx, e.freq, audioNow + eventTime - offset, e.duration * 60 / this.bpm, e.amplitude);
      }
      this.startTimer();
      return;
    }

    // 从头播放
    this.state = 'playing';
    this.onStateChange?.('playing');
    this.pausedElapsed = 0;
    this.startPerf = performance.now();

    const ctx = this.synth.ensureContext();
    const audioNow = ctx.currentTime;
    for (const e of this.events) {
      const eventTime = e.startBeat * 60 / this.bpm;
      this.synth.playNote(ctx, e.freq, audioNow + eventTime, e.duration * 60 / this.bpm, e.amplitude);
    }
    this.startTimer();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.onStateChange?.('paused');
    this.pausedElapsed = this.getElapsed();
    this.stopTimer();
    this.synth.stop();
  }

  stop() {
    this.state = 'idle';
    this.onStateChange?.('idle');
    this.pausedElapsed = 0;
    this.stopTimer();
    this.synth.stop();
    this.onProgress?.(0);
  }

  private startTimer() {
    this.stopTimer();
    this.timerId = window.setInterval(() => {
      const elapsed = this.getElapsed();
      const currentBeat = elapsed * this.bpm / 60;
      this.onProgress?.(currentBeat);

      if (elapsed >= this.totalDuration) {
        this.stop();
      }
    }, 100);
  }

  private stopTimer() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  dispose() {
    this.stop();
    this.onProgress = null;
    this.onStateChange = null;
  }
}

// 全局播放器实例
export const player = new Player();
