/**
 * Purpose: the minimal line chart shared by the palace's trend cards (spec 035 T7a) — one
 * Y axis, thin lines, sparse date ticks, a plain date+value tooltip, and a legend whose
 * items explain themselves on hover (one sentence per line, no standing captions).
 * Main exports: TrendSeries, TrendLineChart.
 */
import type { TrendPoint } from "@breadcrumb/plugin-feedback";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  data: readonly TrendPoint[];
  /** One complete sentence shown when the legend item is hovered/focused: what the line
   * measures and what its value means. Omit only when there is nothing to explain. */
  explanation?: string;
}

const AXIS_TICK_STYLE = { fontSize: 10, fill: "#a8a29e" };
const CHART_HEIGHT = 160;
const X_AXIS_TICK_TARGET = 5;

/** "YYYY-MM-DD" -> "MM-DD"; the year rarely matters at trend-window scale. */
function formatTickDate(date: string): string {
  return date.slice(5);
}

/** Evenly-spaced subset of dates for a readable X axis instead of one tick per day. */
function sparseTicks(dates: readonly string[]): string[] {
  if (dates.length <= X_AXIS_TICK_TARGET) return [...dates];
  const step = (dates.length - 1) / (X_AXIS_TICK_TARGET - 1);
  const ticks: string[] = [];
  for (let i = 0; i < X_AXIS_TICK_TARGET; i += 1) {
    const date = dates[Math.round(i * step)];
    if (date !== undefined && !ticks.includes(date)) ticks.push(date);
  }
  return ticks;
}

/** Every series shares the same date sequence (same window, same `todayIso`); merged into
 * recharts' one-row-per-date shape. */
function mergeSeries(series: readonly TrendSeries[]): Record<string, string | number>[] {
  const dates = series[0]?.data.map((point) => point.date) ?? [];
  return dates.map((date, index) => {
    const row: Record<string, string | number> = { date };
    for (const oneSeries of series) row[oneSeries.key] = oneSeries.data[index]?.value ?? 0;
    return row;
  });
}

function TrendTooltip({ active, payload, label }: TooltipContentProps) {
  if (active !== true || payload === undefined || payload.length === 0) return null;
  return (
    <div className="rounded border border-stone-200 bg-white px-2 py-1 text-[10px] shadow-sm">
      <p className="text-stone-500">{label}</p>
      {payload.map((entry) => (
        <p key={String(entry.dataKey ?? entry.name)} className="text-stone-700">
          {payload.length > 1 ? `${entry.name}: ` : ""}
          {entry.value}
        </p>
      ))}
    </div>
  );
}

/** Legend row below the plot: a colored line sample + plain name per series; hovering (or
 * keyboard-focusing) an item reveals its one-sentence explanation in a small tooltip.
 * Names stay in text ink — the colored sample alone carries series identity. */
function TrendLegend({ series }: { series: readonly TrendSeries[] }) {
  return (
    <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px]">
      {series.map((oneSeries) => (
        <span
          key={oneSeries.key}
          tabIndex={oneSeries.explanation !== undefined ? 0 : undefined}
          className="group relative flex cursor-help items-center gap-1.5 focus:outline-none"
        >
          <span
            aria-hidden
            className="inline-block h-0.5 w-4 rounded-full"
            style={{ backgroundColor: oneSeries.color }}
          />
          <span className="text-stone-600">{oneSeries.label}</span>
          {oneSeries.explanation !== undefined && (
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-56 -translate-x-1/2 rounded border border-stone-200 bg-white p-2 text-start leading-relaxed text-stone-600 shadow-sm group-hover:block group-focus-visible:block"
            >
              {oneSeries.explanation}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

/** `valueDecimals` controls Y-axis tick formatting only (data values are already rounded by
 * the pure trend functions upstream). `height` sets the plot height (the legend renders
 * below the plot, outside this height). */
export function TrendLineChart({
  series,
  valueDecimals = 0,
  height = CHART_HEIGHT,
}: {
  series: readonly TrendSeries[];
  valueDecimals?: number;
  height?: number;
}) {
  const data = mergeSeries(series);
  const dates = data.map((row) => row.date as string);
  // A single unexplained series needs no legend box — the card title names it.
  const showLegend =
    series.length > 1 || series.some((oneSeries) => oneSeries.explanation !== undefined);

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e7e5e4" vertical={false} />
          <XAxis
            dataKey="date"
            ticks={sparseTicks(dates)}
            tickFormatter={formatTickDate}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK_STYLE}
          />
          <YAxis
            width={valueDecimals > 0 ? 32 : 24}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK_STYLE}
            allowDecimals={valueDecimals > 0}
            tickFormatter={
              valueDecimals > 0 ? (value: number) => value.toFixed(valueDecimals) : undefined
            }
          />
          <Tooltip content={TrendTooltip} />
          {series.map((oneSeries) => (
            <Line
              key={oneSeries.key}
              type="monotone"
              dataKey={oneSeries.key}
              name={oneSeries.label}
              stroke={oneSeries.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {showLegend && <TrendLegend series={series} />}
    </div>
  );
}
