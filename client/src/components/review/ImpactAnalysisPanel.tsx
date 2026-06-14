import { useState, useEffect } from 'react';
import { impactApi } from '@/api';
import type { ImpactResult } from '@/api';
import styles from './ImpactAnalysisPanel.module.css';

interface Props {
  branchId?: number;
  scoreId?: number;
}

const severityConfig = {
  high: { label: '高风险', color: '#cf222e', bg: '#FFebe9' },
  medium: { label: '中风险', color: '#d4920b', bg: '#fff8c5' },
  low: { label: '低风险', color: '#1a7f37', bg: '#dafbe1' },
};

const typeLabels: Record<string, string> = {
  tempo: '速度',
  key: '调号',
  structure: '结构',
  harmonic: '和声',
  voice_leading: '声部',
  dynamic: '力度',
};

export function ImpactAnalysisPanel({ branchId, scoreId }: Props) {
  const [analyses, setAnalyses] = useState<ImpactResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!branchId && !scoreId) return;
    setLoading(true);
    const load = branchId
      ? impactApi.analyzeBranch(branchId).then(r => r.analyses)
      : scoreId
        ? impactApi.getSummary(scoreId).then(() => [] as ImpactResult[])
        : Promise.resolve([]);
    load.then(setAnalyses).catch(() => {}).finally(() => setLoading(false));
  }, [branchId, scoreId]);

  const highCount = analyses.filter(a => a.overallRisk === 'high').length;
  const medCount = analyses.filter(a => a.overallRisk === 'medium').length;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>影响分析</h3>
        <span className={styles.count}>{analyses.length} 个乐段</span>
      </div>

      {/* 风险汇总 */}
      <div className={styles.summary}>
        <div className={styles.summaryItem} style={{ color: '#cf222e' }}>
          <span className={styles.summaryValue}>{highCount}</span>
          <span className={styles.summaryLabel}>高风险</span>
        </div>
        <div className={styles.summaryItem} style={{ color: '#d4920b' }}>
          <span className={styles.summaryValue}>{medCount}</span>
          <span className={styles.summaryLabel}>中风险</span>
        </div>
        <div className={styles.summaryItem} style={{ color: '#1a7f37' }}>
          <span className={styles.summaryValue}>{analyses.length - highCount - medCount}</span>
          <span className={styles.summaryLabel}>低风险</span>
        </div>
      </div>

      {loading && <div className={styles.loading}>分析中…</div>}

      {/* 分析列表 */}
      <div className={styles.list}>
        {!loading && analyses.length === 0 && (
          <div className={styles.empty}>暂无数据</div>
        )}
        {analyses.map((a, i) => {
          const cfg = severityConfig[a.overallRisk];
          return (
            <div key={i} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.sectionName}>{a.sectionName}</span>
                <span className={styles.riskBadge} style={{ color: cfg.color, backgroundColor: cfg.bg, borderColor: cfg.color }}>
                  {cfg.label}
                </span>
              </div>

              {a.impacts.length === 0 && (
                <p className={styles.noImpact}>无显著影响</p>
              )}

              {a.impacts.map((imp, j) => {
                const sev = severityConfig[imp.severity];
                return (
                  <div key={j} className={styles.impactRow}>
                    <div className={styles.impactHeader}>
                      <span className={styles.impactType}>{typeLabels[imp.type] || imp.type}</span>
                      <span className={styles.impactSev} style={{ color: sev.color }}>{sev.label}</span>
                    </div>
                    <p className={styles.impactDesc}>{imp.description}</p>
                    <p className={styles.impactSug}>{imp.suggestion}</p>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
