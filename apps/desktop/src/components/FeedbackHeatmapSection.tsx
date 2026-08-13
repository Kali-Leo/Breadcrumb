/**
 * Purpose: the 🪞 feedback lab's "学习热力图" section — 365 days of amber-scale footprint
 * counts (react-activity-calendar, open-source-first) plus a plain continuity line; no
 * target line, no comparison to anyone else.
 * Main exports: FeedbackHeatmapSection.
 */
import { continuityLine, FEEDBACK_COPY } from "@breadcrumb/plugin-feedback";
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

export function FeedbackHeatmapSection() {
  const cells = useFeedbackStore((state) => state.cells);
  const continuity = useFeedbackStore((state) => state.continuity);

  const activities: Activity[] = cells.map((cell) => ({
    date: cell.date,
    count: cell.count,
    level: levelForCount(cell.count),
  }));

  return (
    <section className="rounded border border-stone-200 bg-white p-3">
      <h3 className="font-semibold text-stone-600">{FEEDBACK_COPY.heatmapTitle}</h3>
      <p className="mt-1 text-stone-400">{FEEDBACK_COPY.heatmapHint}</p>
      {continuity.activeDays === 0 ? (
        <p className="mt-2 text-stone-400">{FEEDBACK_COPY.heatmapEmpty}</p>
      ) : (
        <>
          <div className="mt-2 overflow-x-auto">
            <ActivityCalendar
              data={activities}
              theme={AMBER_THEME}
              colorScheme="light"
              blockSize={10}
              blockMargin={3}
              fontSize={10}
              showColorLegend={false}
              showTotalCount={false}
              showWeekdayLabels={false}
            />
          </div>
          <p className="mt-2 text-stone-500">
            {continuityLine(
              continuity.activeDays,
              continuity.longestRunDays,
              continuity.currentRunDays,
            )}
          </p>
        </>
      )}
      <p className="mt-2 text-[10px] text-stone-400">{FEEDBACK_COPY.heatmapBasis}</p>
    </section>
  );
}
