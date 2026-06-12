/**
 * MusicXML 导入对话框
 * 支持拖拽或选择 .xml 文件，导入为乐谱
 */
import { useState, useRef, useCallback } from 'react';
import { importApi } from '@/api';
import type { ScoreRow } from '@/api';
import { Button } from '@/components/shared/Button';
import styles from './ImportModal.module.css';

interface Props {
  onClose: () => void;
  onImported: (result: { scoreId?: number; branchId?: number; title: string }) => void;
  scoreId?: number;
  scores?: ScoreRow[];
}

export function ImportModal({ onClose, onImported, scoreId: fixedScoreId, scores }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [target, setTarget] = useState<'new' | 'existing'>('new');
  const [targetScoreId, setTargetScoreId] = useState<number | undefined>(fixedScoreId);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setError(null);
    if (!f.name.endsWith('.xml') && !f.name.endsWith('.musicxml')) {
      setError('请选择 .xml 或 .musicxml 文件');
      return;
    }
    setFile(f);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleUpload = useCallback(async () => {
    if (!file) return;
    // 确认
    const targetName = fixedScoreId
      ? `乐谱 ID ${fixedScoreId}`
      : target === 'existing'
        ? scores?.find(s => s.id === targetScoreId)?.name || `乐谱 ID ${targetScoreId}`
        : '新乐谱';
    if (!window.confirm(`确定将「${file.name}」导入到「${targetName}」？\n导入到已有乐谱会创建分支，不会覆盖主库。`)) return;

    setLoading(true);
    setError(null);
    try {
      const text = await file.text();
      const sid = fixedScoreId || (target === 'existing' ? targetScoreId : undefined);
      const result = await importApi.upload(text, sid);
      onImported(result);
    } catch (err: any) {
      setError(err.message || '导入失败');
    } finally {
      setLoading(false);
    }
  }, [file, fixedScoreId, target, targetScoreId, scores, onImported]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>🎵 导入 MusicXML</h2>

        {/* 目标选择（仅在未指定scoreId且有已有乐谱时显示） */}
        {!fixedScoreId && scores && scores.length > 0 && (
          <div className={styles.targetRow}>
            <button className={`${styles.targetBtn} ${target === 'new' ? styles.targetActive : ''}`} onClick={() => setTarget('new')}>
              🆕 创建新乐谱
            </button>
            <button className={`${styles.targetBtn} ${target === 'existing' ? styles.targetActive : ''}`} onClick={() => setTarget('existing')}>
              📥 导入到已有乐谱
            </button>
          </div>
        )}
        {!fixedScoreId && target === 'existing' && scores && scores.length > 0 && (
          <select className={styles.targetSelect} value={targetScoreId || ''} onChange={(e) => setTargetScoreId(Number(e.target.value))}>
            <option value="">选择目标乐谱…</option>
            {scores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}

        <p className={styles.desc}>
          {fixedScoreId
            ? '将导入到当前乐谱的新分支中'
            : target === 'existing'
              ? '导入到选中乐谱的分支中，可在分支管理查看'
              : '上传 .xml 或 .musicxml 文件，自动创建乐谱'}
        </p>

        {/* 拖拽区 */}
        <div
          className={`${styles.dropZone} ${dragOver ? styles.dropActive : ''} ${file ? styles.hasFile : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xml,.musicxml"
            style={{ display: 'none' }}
            onChange={handleInput}
          />
          {file ? (
            <div className={styles.fileInfo}>
              <span className={styles.fileIcon}>📄</span>
              <span className={styles.fileName}>{file.name}</span>
              <span className={styles.fileSize}>{(file.size / 1024).toFixed(1)} KB</span>
            </div>
          ) : (
            <div className={styles.dropHint}>
              <span className={styles.dropIcon}>📂</span>
              <span>拖拽 MusicXML 文件到此处</span>
              <span className={styles.dropSub}>或点击选择文件</span>
            </div>
          )}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <Button variant="secondary" size="md" onClick={onClose}>取消</Button>
          <Button variant="primary" size="md" onClick={handleUpload} disabled={!file || loading} loading={loading}>
            {loading ? '导入中…' : '导入'}
          </Button>
        </div>
      </div>
    </div>
  );
}
