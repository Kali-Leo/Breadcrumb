/**
 * Purpose: the 🪞 feedback lab's "学习热力图" section — 365 days of amber-scale footprint
 * counts (react-activity-calendar, open-source-first) plus a plain continuity line; no
 * target line, no comparison to anyone else.
 * Main exports: FeedbackHeatmapSection.
 */
import { activityLine, FEEDBACK_COPY, heatmapCellLine } from "@breadcrumb/plugin-feedback";
import { cloneElement, useEffect, useRef } from "react";
import { type Activity, ActivityCalendar } from "react-activity-calendar";
import { useFeedbackStore } from "../stores/feedbackStore";

/** Fixed count→level buckets driving block color intensity only — never rendered as text,
 * so this is not a new user-facing metric name (注意力设计手册 §本项目特有规矩 1). */
function levelForCount(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

// Amber scale (product's accent color): empty cell, then four deepening steps.
const AMBER_THEME = { light: ["#f5f5f4", "#fde68a", "#fbbf24", "#d97706", "#92400e"] };

const MONTH_LABELS = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
];

export function FeedbackHeatmapSection() {
  const cells = useFeedbackStore((state) => state.cells);
  const continuity = useFeedbackStore((state) => state.continuity);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const activities: Activity[] = cells.map((cell) => ({
    date: cell.date,
    count: cell.count,
    level: levelForCount(cell.count),
  }));

  // The rightmost column is today — land there, not on last year's left edge. The library
  // scrolls inside its own container, so sweep every horizontally overflowing descendant.
  useEffect(() => {
    const container = scrollRef.current;
    if (container === null) return;
    const candidates = [container, ...Array.from(container.querySelectorAll("div"))];
    for (const element of candidates) {
      if (element.scrollWidth > element.clientWidth) element.scrollLeft = element.scrollWidth;
    }
  }, []);

  return (
    <section className="rounded-xl bg-white p-3 shadow-sm">
      <h3 className="font-semibold text-stone-600">{FEEDBACK_COPY.heatmapTitle}</h3>
      {continuity.activeDays === 0 ? (
        <p className="mt-2 text-stone-400">{FEEDBACK_COPY.heatmapEmpty}</p>
      ) : (
        <>
          {/* How-to-read note lives on hover over the calendar area (progressive
              disclosure); each cell adds its own date + footprint-count title. */}
          <div
            ref={scrollRef}
            className="mt-2 overflow-x-auto"
            title={FEEDBACK_COPY.heatmapHoverNote}
          >
            <ActivityCalendar
              data={activities}
              theme={AMBER_THEME}
              colorScheme="light"
              blockSize={10}
              blockMargin={3}
              fontSize={10}
              labels={{ months: MONTH_LABELS }}
              renderBlock={(block, activity) =>
                cloneElement(
                  block,
                  {},
                  <title>{heatmapCellLine(activity.date, activity.count)}</title>,
                )
              }
              showColorLegend={false}
              showTotalCount={false}
              showWeekdayLabels={false}
            />
          </div>
          <p className="mt-2 text-stone-500">{activityLine(continuity.activeDays)}</p>
        </>
      )}
    </section>
  );
}
