import { Spinner } from '@xpntl/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { Chart } from '../components/Chart';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { useProjects } from '../lib/project-store';

type CycleTime = { count: number; avgHours: number; p50Hours: number; p75Hours: number; p90Hours: number };
type ThroughputBucket = { weekStart: string; count: number };
type VelocityBucket = { weekStart: string; completed: number };
type BurndownBucket = { date: string; total: number; completed: number; remaining: number };
type AssigneeLoad = { assigneeId: string; displayName: string | null; email: string; openCount: number };

export function InsightsPage() {
  const { token } = useAuth();
  const projects = useProjects((s) => s.all);

  const [projectId, setProjectId] = useState<string | undefined>();
  const [cycleTime, setCycleTime] = useState<CycleTime | null>(null);
  const [throughput, setThroughput] = useState<ThroughputBucket[]>([]);
  const [velocity, setVelocity] = useState<VelocityBucket[]>([]);
  const [burndown, setBurndown] = useState<BurndownBucket[]>([]);
  const [assigneeLoad, setAssigneeLoad] = useState<AssigneeLoad[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        const opts = projectId ? { projectId } : undefined;
        const fetches: Promise<unknown>[] = [
          api.getCycleTime(opts, token),
          api.getThroughput(opts, token),
          api.getVelocity(opts, token),
          api.getLoadByAssignee(token),
        ];
        if (projectId) fetches.push(api.getBurndown(projectId, token));
        const results = await Promise.all(fetches);
        if (cancelled) return;
        setCycleTime(results[0] as CycleTime);
        setThroughput((results[1] as { buckets: ThroughputBucket[] }).buckets);
        setVelocity((results[2] as { buckets: VelocityBucket[] }).buckets);
        setAssigneeLoad((results[3] as { assignees: AssigneeLoad[] }).assignees);
        setBurndown(projectId ? (results[4] as { buckets: BurndownBucket[] }).buckets : []);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [token, projectId]);

  // ── derived KPIs for hero strip ───────────────────────────────────────────
  const completed4w = throughput.slice(-4).reduce((s, b) => s + b.count, 0);
  const velocity4w = velocity.slice(-4);
  const avgVelocity = velocity4w.length
    ? Math.round(velocity4w.reduce((s, b) => s + b.completed, 0) / velocity4w.length)
    : 0;
  const openAssigned = assigneeLoad.reduce((s, a) => s + a.openCount, 0);
  const cycleP50 = cycleTime && cycleTime.count > 0 ? formatHours(cycleTime.p50Hours) : '—';

  const kpis = [
    { label: 'Completed · 4 wks', value: String(completed4w), sub: 'issues done' },
    { label: 'Median cycle time', value: cycleP50, sub: `${cycleTime?.count ?? 0} measured` },
    { label: 'Avg velocity · 4 wks', value: String(avgVelocity), sub: 'issues/week' },
    { label: 'Open & assigned', value: String(openAssigned), sub: `${assigneeLoad.length} ${assigneeLoad.length === 1 ? 'person' : 'people'}` },
  ];

  // ── chart options (memoized so the Chart wrapper's effect-on-option doesn't
  //    needlessly re-init on unrelated re-renders) ───────────────────────────
  const throughputOption = useMemo(() => buildBarOption(
    throughput.map((b) => formatShortDate(b.weekStart)),
    throughput.map((b) => b.count),
    'Completed',
  ), [throughput]);

  const velocityOption = useMemo(() => buildBarOption(
    velocity.map((b) => formatShortDate(b.weekStart)),
    velocity.map((b) => b.completed),
    'Completed',
  ), [velocity]);

  const cycleOption = useMemo(() => {
    if (!cycleTime || cycleTime.count === 0) return null;
    return buildBarOption(
      ['Avg', 'p50', 'p75', 'p90'],
      [cycleTime.avgHours, cycleTime.p50Hours, cycleTime.p75Hours, cycleTime.p90Hours].map((h) => +h.toFixed(1)),
      'Hours',
    );
  }, [cycleTime]);

  const burndownOption = useMemo(() => {
    if (burndown.length === 0) return null;
    return buildBurndownOption(burndown);
  }, [burndown]);

  const loadOption = useMemo(() => {
    if (assigneeLoad.length === 0) return null;
    return buildLoadOption(assigneeLoad);
  }, [assigneeLoad]);

  // ── PDF export ────────────────────────────────────────────────────────────
  async function exportPdf() {
    if (!reportRef.current || exportingPdf) return;
    setExportingPdf(true);
    try {
      // Lazy-load the heavy deps so they only ship when someone clicks Export PDF.
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--xp-canvas') || '#fff',
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 32;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 16;
      pdf.addImage(imgData, 'PNG', 16, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - 16;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 16;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 16, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const proj = projectId ? `-${projects.find((p) => p.id === projectId)?.key ?? projectId}` : '';
      pdf.save(`insights${proj}-${stamp}.pdf`);
    } finally {
      setExportingPdf(false);
    }
  }

  function openExport(format: 'csv' | 'json') {
    const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
    const qs = new URLSearchParams({ format });
    if (projectId) qs.set('projectId', projectId);
    window.open(`${API_URL}/v1/analytics/export?${qs.toString()}`, '_blank');
  }

  return (
    <AppLayout>
      <div
        style={{
          height: '100%',
          width: '100%',
          overflow: 'auto',
          fontFamily: 'var(--xp-font-mono)',
          color: 'var(--xp-ink)',
        }}
      >
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
              Insights
            </h1>
            <div style={{ flex: 1, minWidth: 8 }} />
            <select
              value={projectId ?? ''}
              onChange={(e) => setProjectId(e.target.value || undefined)}
              style={filterSelect}
              aria-label="Filter by project"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button type="button" onClick={() => openExport('csv')} style={exportBtn}>Export CSV</button>
            <button type="button" onClick={() => openExport('json')} style={exportBtn}>Export JSON</button>
            <button
              type="button"
              onClick={exportPdf}
              disabled={exportingPdf || loading}
              style={{ ...exportBtn, opacity: exportingPdf || loading ? 0.6 : 1 }}
              title="Export the current view as a multi-page PDF report"
            >
              {exportingPdf ? 'Rendering…' : 'Export PDF'}
            </button>
          </div>

          {loading ? (
            <Spinner label="Loading analytics…" />
          ) : (
            <div ref={reportRef} id="insights-report" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Hero KPI strip (XP-22) */}
              <section
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                {kpis.map((k) => (
                  <div key={k.label} style={kpiTile}>
                    <div style={kpiLabel}>{k.label}</div>
                    <div style={kpiValue}>{k.value}</div>
                    <div style={kpiSub}>{k.sub}</div>
                  </div>
                ))}
              </section>

              {/* Burndown — full width when a project is selected (most useful at a glance) */}
              {projectId && burndownOption && (
                <section style={panel}>
                  <PanelHeader title="Burndown" desc={`Remaining vs. ideal for the selected project (last ${burndown.length} days).`} />
                  <Chart option={burndownOption} height={260} />
                </section>
              )}

              {/* Chart grid — at least 3 across once the viewport allows */}
              <section
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                  gap: 16,
                }}
              >
                <div style={panel}>
                  <PanelHeader title="Throughput" desc="Issues completed per ISO week (last 90 days)." />
                  {throughput.length === 0
                    ? <EmptyMsg text="No completed issues in this period." />
                    : <Chart option={throughputOption} height={220} />}
                </div>

                <div style={panel}>
                  <PanelHeader title="Velocity" desc="Issues completed per week (last 12 weeks)." />
                  {velocity.length === 0
                    ? <EmptyMsg text="No velocity data yet." />
                    : <Chart option={velocityOption} height={220} />}
                </div>

                <div style={panel}>
                  <PanelHeader title="Cycle time" desc={`Creation → done (n=${cycleTime?.count ?? 0}).`} />
                  {cycleOption
                    ? <Chart option={cycleOption} height={220} />
                    : <EmptyMsg text="No cycle-time data yet." />}
                </div>

                <div style={{ ...panel, gridColumn: 'span 2' }}>
                  <PanelHeader title="Load by assignee" desc="Open issues (not completed/canceled) per assignee." />
                  {loadOption
                    ? <Chart option={loadOption} height={Math.max(180, assigneeLoad.length * 28 + 40)} />
                    : <EmptyMsg text="No assigned open issues." />}
                </div>
              </section>

              {/* Cycle-time percentiles — numeric detail under the chart */}
              {cycleTime && cycleTime.count > 0 && (
                <section style={panel}>
                  <PanelHeader title="Cycle time · percentiles" desc="Tabular detail for the cycle-time distribution." />
                  <div style={tableWrapper}>
                    <table style={table}>
                      <thead>
                        <tr>
                          <th style={th}>Metric</th>
                          <th style={{ ...th, textAlign: 'right' }}>Hours</th>
                          <th style={{ ...th, textAlign: 'right' }}>Days</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Average', val: cycleTime.avgHours },
                          { label: 'p50 (Median)', val: cycleTime.p50Hours },
                          { label: 'p75', val: cycleTime.p75Hours },
                          { label: 'p90', val: cycleTime.p90Hours },
                        ].map((r) => (
                          <tr key={r.label}>
                            <td style={td}>{r.label}</td>
                            <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.val.toFixed(1)}</td>
                            <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--xp-muted)' }}>
                              {(r.val / 24).toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Small render helpers
// ───────────────────────────────────────────────────────────────────────────

function PanelHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <h2 style={sectionTitle}>{title}</h2>
      <p style={sectionDesc}>{desc}</p>
    </div>
  );
}

function EmptyMsg({ text }: { text: string }) {
  return <div style={emptyMsg}>{text}</div>;
}

// ───────────────────────────────────────────────────────────────────────────
// ECharts option builders
// ───────────────────────────────────────────────────────────────────────────

type ChartOption = Record<string, unknown>;

function buildBarOption(categories: string[], values: number[], seriesName: string): ChartOption {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'category', data: categories, axisLabel: { rotate: categories.length > 8 ? 30 : 0 } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      name: seriesName,
      type: 'bar',
      data: values,
      itemStyle: { color: readCssVar('--xp-accent', '#f5c518'), borderRadius: [2, 2, 0, 0] },
      barMaxWidth: 32,
    }],
  };
}

function buildBurndownOption(buckets: BurndownBucket[]): ChartOption {
  const dates = buckets.map((b) => formatShortDate(b.date));
  const remaining = buckets.map((b) => b.remaining);
  const total = buckets.map((b) => b.total);
  // Ideal-line: straight line from start total to 0 over the period.
  const start = total[0] ?? 0;
  const ideal = buckets.map((_, i, arr) =>
    arr.length <= 1 ? start : +(start * (1 - i / (arr.length - 1))).toFixed(2),
  );
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['Remaining', 'Ideal'], top: 0, textStyle: { color: readCssVar('--xp-muted', '#888'), fontFamily: 'inherit', fontSize: 11 } },
    grid: { left: 36, right: 12, top: 32, bottom: 28 },
    xAxis: { type: 'category', data: dates, boundaryGap: false, axisLabel: { rotate: dates.length > 14 ? 30 : 0 } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        name: 'Remaining',
        type: 'line',
        data: remaining,
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: readCssVar('--xp-accent-strong', '#bf8a00'), width: 2 },
        areaStyle: { color: readCssVar('--xp-accent', '#f5c518'), opacity: 0.18 },
        itemStyle: { color: readCssVar('--xp-accent-strong', '#bf8a00') },
      },
      {
        name: 'Ideal',
        type: 'line',
        data: ideal,
        smooth: false,
        symbol: 'none',
        lineStyle: { color: readCssVar('--xp-muted', '#888'), type: 'dashed', width: 1 },
      },
    ],
  };
}

function buildLoadOption(loads: AssigneeLoad[]): ChartOption {
  // Horizontal bar — best fit for variable-length labels.
  const sorted = [...loads].sort((a, b) => a.openCount - b.openCount);
  const names = sorted.map((a) => a.displayName ?? a.email);
  const values = sorted.map((a) => a.openCount);
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 140, right: 24, top: 8, bottom: 24 },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', data: names, axisLabel: { fontSize: 11 } },
    series: [{
      name: 'Open',
      type: 'bar',
      data: values,
      itemStyle: { color: readCssVar('--xp-accent', '#f5c518'), borderRadius: [0, 2, 2, 0] },
      label: { show: true, position: 'right', fontSize: 10, color: readCssVar('--xp-muted', '#888') },
      barMaxWidth: 18,
    }],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Token + format helpers
// ───────────────────────────────────────────────────────────────────────────

function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function formatHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '—';
  if (h >= 24) return `${(h / 24).toFixed(1)}d`;
  if (h >= 1) return `${Math.round(h)}h`;
  return `${Math.round(h * 60)}m`;
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────────────────────

const panel: React.CSSProperties = {
  border: '1px solid var(--xp-hairline)',
  borderRadius: 'var(--xp-r-md)',
  background: 'var(--xp-surface)',
  padding: '16px 18px',
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
};

const kpiTile: React.CSSProperties = {
  border: '1px solid var(--xp-hairline)',
  borderRadius: 'var(--xp-r-md)',
  background: 'var(--xp-surface)',
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const kpiLabel: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--xp-faint)',
};

const kpiValue: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 650,
  letterSpacing: '-0.02em',
  margin: '4px 0 2px',
  fontVariantNumeric: 'tabular-nums',
};

const kpiSub: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--xp-muted)',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  margin: 0,
  color: 'var(--xp-ink)',
};

const sectionDesc: React.CSSProperties = {
  fontSize: 11.5,
  color: 'var(--xp-muted)',
  margin: '2px 0 0',
};

const tableWrapper: React.CSSProperties = {
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  overflow: 'hidden',
};

const table: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  fontWeight: 500,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--xp-muted)',
  background: 'var(--xp-surface)',
  borderBottom: '1px solid var(--xp-border)',
};

const td: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid var(--xp-border)',
};

const emptyMsg: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--xp-muted)',
  padding: '24px 0',
  textAlign: 'center',
};

const filterSelect: React.CSSProperties = {
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 12,
  padding: '5px 8px',
  background: 'var(--xp-surface)',
  color: 'var(--xp-ink)',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  cursor: 'pointer',
};

const exportBtn: React.CSSProperties = {
  fontFamily: 'var(--xp-font-mono)',
  fontSize: 11,
  fontWeight: 500,
  padding: '5px 10px',
  background: 'var(--xp-layer)',
  color: 'var(--xp-ink)',
  border: '1px solid var(--xp-border)',
  borderRadius: 'var(--xp-r-sm)',
  cursor: 'pointer',
};
