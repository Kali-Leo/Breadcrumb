/**
 * Purpose: the right rail's region readout while a continent or kingdom is hovered — the
 * same two mirror visuals the world level shows (activity heatmap + layer trend lines),
 * scoped to the hovered region's member nodes via plugin-feedback's scoped series. Thin
 * wrappers feed the same underlying primitives (react-activity-calendar / TrendLineChart)
 * because the frozen sections read the global store and take no data props.
 * Main exports: RegionMirror.
 */
import {
  computeScopedDailyActivity,
  computeScopedLayerTrendSeries,
  heatmapCellMessage,
  TREND_WINDOW_DAYS,
  type TrendPoint,
} from "@breadcrumb/plugin-feedback";
import { cloneElement, useEffect, useMemo, useRef } from "react";
import { type Activity, ActivityCalendar } from "react-activity-calendar";
import { useTranslation } from "react-i18next";
import { useCopyMessage } from "../../i18n/useCopyMessage";
import type { RegionFeedbackSources } from "../../lib/regionFeedbackData";
import { nowIso } from "../../lib/time";
import { TrendLineChart } from "../TrendLineChart";

/** Same window as the global heatmap so the two read as one visual. */
const HEATMAP_DAYS = 365;

// Mirrors of FeedbackHeatmapSection/FeedbackTrendsSection's private constants (those files
// are frozen and export nothing) — same buckets, same amber scale, same line colors.
const AMBER_THEME = { light: ["#f5f5f4", "#fde68a", "#fbbf24", "#d97706", "#92400e"] };
const MEMORY_COLOR = "#d97706";
const UNDERSTANDING_COLOR = "#0d9488";
const INTUITION_COLOR = "#6d28d9";

function levelForCount(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

interface RegionMirrorProps {
  title: string;
  memberCount: number;
  nodeIds: ReadonlySet<string>;
  sources: RegionFeedbackSources | null;
  /** Shown when the region has no activity — goal surfaces pass goal-aware wording. */
  emptyLine?: string;
}

export function RegionMirror({
  title,
  memberCount,
  nodeIds,
  sources,
  emptyLine,
}: RegionMirrorProps) {
  const { t } = useTranslation(["palace", "common"]);
  const copy = useCopyMessage();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const data = useMemo(() => {
    if (sources === null) return null;
    const now = nowIso();
    const cells = computeScopedDailyActivity(sources.sightings, nodeIds, {
      days: HEATMAP_DAYS,
      todayIso: now,
    });
    const layers = computeScopedLayerTrendSeries({
      sightings: sources.sightings,
      claims: sources.claims,
      productiveUseTimesByNode: sources.productiveUseTimesByNode,
      nodeIds,
      days: TREND_WINDOW_DAYS,
      todayIso: now,
    });
    const hasActivity = cells.some((cell) => cell.count > 0);
    return { cells, layers, hasActivity };
  }, [sources, nodeIds]);

  // Land on today (the rightmost column), same as the global heatmap; re-runs when the
  // computed data changes because the calendar only exists once a region has activity.
  useEffect(() => {
    if (data === null || !data.hasActivity) return;
    const container = scrollRef.current;
    if (container === null) return;
    const candidates = [container, ...Array.from(container.querySelectorAll("div"))];
    for (const element of candidates) {
      if (element.scrollWidth > element.clientWidth) element.scrollLeft = element.scrollWidth;
    }
  }, [data]);

  const header = (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <p className="text-base font-semibold text-stone-700">{title}</p>
      <p className="mt-1 text-sm text-stone-500">{memberCount} 个知识点</p>
    </div>
  );

  if (data === null) {
    return (
      <>
        {header}
        <p className="text-xs text-stone-400">{t("palace:mirror.loading")}</p>
      </>
    );
  }
  if (!data.hasActivity) {
    return (
      <>
        {header}
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <p className="text-xs text-stone-400">{emptyLine ?? "这片区域还没有学习记录"}</p>
        </div>
      </>
    );
  }

  const activities: Activity[] = data.cells.map((cell) => ({
    date: cell.date,
    count: cell.count,
    level: levelForCount(cell.count),
  }));
  const layers = data.layers;
  const toSeries = (pick: (point: (typeof layers)[number]) => number): TrendPoint[] =>
    layers.map((point) => ({ date: point.date, value: pick(point) }));

  return (
    <>
      {header}
      <section className="rounded-xl bg-white p-3 text-xs shadow-sm">
        <h3 className="font-semibold text-stone-600">{t("palace:mirror.heatmapTitle")}</h3>
        <div
          ref={scrollRef}
          className="mt-2 overflow-x-auto"
          title={t("palace:mirror.heatmapHoverNote")}
        >
          <ActivityCalendar
            data={activities}
            theme={AMBER_THEME}
            colorScheme="light"
            blockSize={10}
            blockMargin={3}
            fontSize={10}
            showMonthLabels={false}
            renderBlock={(block, activity) =>
              cloneElement(
                block,
                {},
                <title>{copy(heatmapCellMessage(activity.date, activity.count))}</title>,
              )
            }
            showColorLegend={false}
            showTotalCount={false}
            showWeekdayLabels={false}
          />
        </div>
      </section>
      <section className="rounded-xl bg-white p-3 text-xs shadow-sm">
        <h3 className="font-semibold text-stone-600">{t("palace:mirror.trendsTitle")}</h3>
        <div className="mt-2">
          <TrendLineChart
            valueDecimals={1}
            series={[
              {
                key: "memory",
                label: t("palace:mirror.trendLayersMemoryLabel"),
                color: MEMORY_COLOR,
                data: toSeries((point) => point.memory),
                explanation: t("palace:mirror.trendLayersMemoryNote"),
              },
              {
                key: "understanding",
                label: t("palace:mirror.trendLayersUnderstandingLabel"),
                color: UNDERSTANDING_COLOR,
                data: toSeries((point) => point.understanding),
                explanation: t("palace:mirror.trendLayersUnderstandingNote"),
              },
              {
                key: "intuition",
                label: t("palace:mirror.trendLayersIntuitionLabel"),
                color: INTUITION_COLOR,
                data: toSeries((point) => point.intuition),
                explanation: t("palace:mirror.trendLayersIntuitionNote"),
              },
            ]}
          />
        </div>
      </section>
    </>
  );
}
