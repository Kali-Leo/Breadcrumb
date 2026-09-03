/**
 * Purpose: the 🪞 feedback lab's "学习热力图" section — 365 days of amber-scale footprint
 * counts (react-activity-calendar, open-source-first) plus a plain continuity line; no
 * target line, no comparison to anyone else.
 * Main exports: FeedbackHeatmapSection.
 */
import { activityMessage, heatmapCellMessage } from "@breadcrumb/feature-feedback";
import { cloneElement, useEffect, useRef } from "react";
import { type Activity, ActivityCalendar } from "react-activity-calendar";
import { useTranslation } from "react-i18next";
import { useCopyMessage } from "../../i18n/useCopyMessage";
import { useFeedbackStore } from "../../stores/feedbackStore";
import { TrailSummaryCard } from "./TrailSummaryCard";

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

/** The calendar's month names in the reader's language — Intl knows them, we do not. */
function monthLabels(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { month: "short" });
  return Array.from({ length: 12 }, (_, month) =>
    format.format(new Date(Date.UTC(2026, month, 1))),
  );
}

export function FeedbackHeatmapSection() {
  const { t, i18n } = useTranslation(["palace", "common"]);
  const copy = useCopyMessage();
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
  // Re-runs when the cells arrive: on first mount the store is still loading and the
  // calendar does not exist yet, so a mount-only effect would leave it parked on the left.
  useEffect(() => {
    if (cells.length === 0) return;
    const container = scrollRef.current;
    if (container === null) return;
    const candidates = [container, ...Array.from(container.querySelectorAll("div"))];
    for (const element of candidates) {
      if (element.scrollWidth > element.clientWidth) element.scrollLeft = element.scrollWidth;
    }
  }, [cells]);

  // The trail card sits above the heatmap as the first thing in the 「这段时间」 stack: the
  // stack's own file lives with the map, so the card rides in here as a leading sibling.
  return (
    <>
      <TrailSummaryCard />
      <section className="rounded-xl bg-white p-3 shadow-sm">
        <h3 className="font-semibold text-stone-600">{t("palace:mirror.heatmapTitle")}</h3>
        {continuity.activeDays === 0 ? (
          <p className="mt-2 text-stone-400">{t("palace:mirror.heatmapEmpty")}</p>
        ) : (
          <>
            {/* How-to-read note lives on hover over the calendar area (progressive
              disclosure); each cell adds its own date + footprint-count title. */}
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
                labels={{ months: monthLabels(i18n.language) }}
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
            {/* Touch has no hover, so the same note is printed below the calendar there. */}
            <p className="mt-2 hidden text-stone-400 coarse:block">
              {t("palace:mirror.heatmapHoverNote")}
            </p>
            <p className="mt-2 text-stone-500">{copy(activityMessage(continuity.activeDays))}</p>
          </>
        )}
      </section>
    </>
  );
}
