import * as echarts from 'echarts/core';
import {
  BarChart as EBarChart,
  LineChart as ELineChart,
} from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  DataZoomComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';

echarts.use([
  EBarChart,
  ELineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

type EChartsOption = echarts.EChartsCoreOption;

/**
 * Resolve a CSS custom property into a concrete color string. ECharts can't
 * read `var(--…)` directly — it needs RGB-ish strings, so we read computed
 * values once at mount.
 */
function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export type ChartProps = {
  option: EChartsOption;
  height?: number | string;
  /** Forwarded to the wrapper div so the PDF exporter can find this chart. */
  className?: string;
};

/**
 * Token-aware ECharts wrapper — applies xp-* colors / font, resizes with the
 * container, and tears down cleanly on unmount.
 */
export function Chart({ option, height = 240, className }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const instRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const inst = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    instRef.current = inst;

    const ink = readToken('--xp-ink', '#222');
    const muted = readToken('--xp-muted', '#888');
    const hairline = readToken('--xp-hairline', '#e4e4e4');
    const surface = readToken('--xp-surface', '#fff');

    const themed: EChartsOption = {
      backgroundColor: 'transparent',
      textStyle: {
        fontFamily: 'var(--xp-font-mono), JetBrains Mono, monospace',
        color: ink,
      },
      tooltip: {
        backgroundColor: surface,
        borderColor: hairline,
        borderWidth: 1,
        textStyle: { color: ink, fontFamily: 'inherit', fontSize: 11 },
        ...(option.tooltip as object | undefined),
      },
      grid: { left: 36, right: 12, top: 24, bottom: 28, ...(option.grid as object | undefined) },
      xAxis: applyAxisTheme(option.xAxis, muted, hairline),
      yAxis: applyAxisTheme(option.yAxis, muted, hairline),
      ...option,
    };
    inst.setOption(themed);

    const ro = new ResizeObserver(() => inst.resize());
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      inst.dispose();
      instRef.current = null;
    };
  }, [option]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ width: '100%', height: typeof height === 'number' ? `${height}px` : height }}
    />
  );
}

function applyAxisTheme(axis: unknown, label: string, line: string): unknown {
  const base = {
    axisLine: { lineStyle: { color: line } },
    axisTick: { lineStyle: { color: line } },
    axisLabel: { color: label, fontSize: 10 },
    splitLine: { lineStyle: { color: line, type: 'dashed' as const } },
  };
  if (Array.isArray(axis)) return axis.map((a) => ({ ...base, ...a }));
  if (axis && typeof axis === 'object') return { ...base, ...axis };
  return base;
}
