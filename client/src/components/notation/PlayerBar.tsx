/**
 * 简谱播放器控制栏
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { parseToPlayEvents, player, type PlayerState } from '@/utils/player';
import type { ParsedScore } from '@/utils/notation';
import styles from './StaffView.module.css';

interface Props {
  parsed: ParsedScore;
  tempo?: string | null;
}

export function PlayerBar({ parsed, tempo }: Props) {
  const [state, setState] = useState<PlayerState>('idle');
  const [progress, setProgress] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  // 解析 BPM
  const bpm = (() => {
    const raw = parsed.tempo || tempo || '';
    const m = raw.match(/(\d+)/);
    return m ? parseInt(m[1]) : 120;
  })();

  // 加载播放事件
  useEffect(() => {
    const rawKey = (parsed.key || '1=C').replace('1=', '');
    const events = parseToPlayEvents(parsed.measures as any, rawKey, bpm);
    player.load(events, bpm);
    setTotalTime(player.totalDuration);
    setProgress(0);

    player.onProgressChange((beat) => {
      const elapsed = beat * 60 / bpm;
      setProgress(elapsed);
    });

    player.onStatusChange((s) => {
      setState(s);
    });

    return () => {
      player.dispose();
    };
  }, [parsed, bpm]);

  const togglePlay = useCallback(() => {
    if (state === 'playing') {
      player.pause();
    } else if (state === 'paused') {
      player.play();
    } else {
      // 重新加载（避免多次 dispose 问题）
      const rawKey = (parsed.key || '1=C').replace('1=', '');
      const events = parseToPlayEvents(parsed.measures as any, rawKey, bpm);
      player.load(events, bpm);
      setTotalTime(player.totalDuration);
      player.play();
    }
  }, [state, parsed, bpm]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progressPct = totalTime > 0 ? Math.min(100, (progress / totalTime) * 100) : 0;

  return (
    <div className={styles.player}>
      <div className={styles.playerControls}>
        <button className={styles.playerBtn} onClick={togglePlay}>
          {state === 'playing' ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="3" y="2" width="2.5" height="10" rx="1" fill="currentColor" />
              <rect x="8.5" y="2" width="2.5" height="10" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 3l9 5-9 5V3z" fill="currentColor" />
            </svg>
          )}
        </button>
        <div className={styles.progressBar}>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
            <div className={styles.progressThumb} style={{ left: `${progressPct}%` }} />
          </div>
        </div>
        <span className={styles.timeDisplay}>
          {formatTime(progress)} / {formatTime(totalTime)}
        </span>
      </div>
      <div className={styles.playerMeta}>
        <span>{parsed.key}</span>
        <span>{parsed.timeSignature}</span>
        {tempo && <span>{tempo}</span>}
        <span>{parsed.measures.length} 小节</span>
        {state === 'playing' && <span style={{ color: 'var(--color-accent)' }}>▶ 播放中</span>}
      </div>
    </div>
  );
}
