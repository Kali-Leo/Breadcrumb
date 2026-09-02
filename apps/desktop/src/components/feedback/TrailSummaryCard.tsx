/**
 * Purpose: the small card at the top of the 「这段时间」 stack — one plain sentence about
 * what yesterday's learning was, and, folded away beneath it, the same for the other days
 * of the past week that have one. Renders nothing at all when there is no sentence: a day
 * without learning is not an empty state to announce (product principle 1).
 * Main exports: TrailSummaryCard.
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { isYesterday } from "../../lib/trail/trailSummaryData";
import { useFeedbackStore } from "../../stores/feedbackStore";

/** "8月30日" / "30 August" for a "YYYY-MM-DD" key, in the reader's language. The key is a
 * local calendar date, so it is rebuilt as a local Date rather than parsed as UTC. */
function formatDay(dateKey: string, locale: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return dateKey;
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(date);
}

export function TrailSummaryCard() {
  const { t, i18n } = useTranslation("palace");
  const rows = useFeedbackStore((state) => state.trailSummaries);
  const loadTrailSummaries = useFeedbackStore((state) => state.loadTrailSummaries);

  // Fill on mount: the stack's other cards load together on map open, but the sentence for
  // yesterday may land after that (it is written in the background at launch).
  useEffect(() => {
    void loadTrailSummaries();
  }, [loadTrailSummaries]);

  const [latest, ...earlier] = rows;
  if (latest === undefined) return null;

  const title = isYesterday(latest.date)
    ? t("mirror.trailTitle")
    : t("mirror.trailTitleDated", { date: formatDay(latest.date, i18n.language) });

  return (
    <section className="rounded-xl bg-white p-3 shadow-sm">
      <h3 className="font-semibold text-stone-600">{title}</h3>
      <p className="mt-2 text-stone-600">{latest.content}</p>
      {earlier.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-stone-400">{t("mirror.trailEarlier")}</summary>
          <ul className="mt-1 space-y-1">
            {earlier.map((row) => (
              <li key={row.date} className="text-stone-500">
                <span className="me-1 text-stone-400">{formatDay(row.date, i18n.language)}</span>
                {row.content}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
