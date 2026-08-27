/**
 * Purpose: the palace rail's "趋势" card (spec 035 T7a; removed in spec 046, restored on
 * Leo's ruling) — the three-layer estimate curve (memory / understanding / intuition, all
 * forgetting-decayed), each line explained on legend hover, measured only against the past
 * self, no target lines.
 * Main exports: FeedbackTrendsSection.
 */
import type { TrendPoint } from "@breadcrumb/plugin-feedback";
import { useTranslation } from "react-i18next";
import { useFeedbackStore } from "../stores/feedbackStore";
import { TrendLineChart } from "./TrendLineChart";

// Already run through the six-point accessibility checklist (contrast against white and
// against each other): amber for memory, teal for understanding, violet for intuition.
const MEMORY_COLOR = "#d97706";
const UNDERSTANDING_COLOR = "#0d9488";
const INTUITION_COLOR = "#6d28d9";
const LAYERS_CHART_HEIGHT = 200;

export function FeedbackTrendsSection() {
  const { t } = useTranslation(["palace", "common"]);
  const trends = useFeedbackStore((state) => state.trends);
  // memory bounds the other two layers by construction, so it alone decides emptiness.
  const isEmpty = trends.layers.every((point) => point.memory === 0);

  const memorySeries: TrendPoint[] = trends.layers.map((point) => ({
    date: point.date,
    value: point.memory,
  }));
  const understandingSeries: TrendPoint[] = trends.layers.map((point) => ({
    date: point.date,
    value: point.understanding,
  }));
  const intuitionSeries: TrendPoint[] = trends.layers.map((point) => ({
    date: point.date,
    value: point.intuition,
  }));

  return (
    <section className="rounded-xl bg-white p-3 shadow-sm">
      <h3 className="font-semibold text-stone-600">{t("palace:mirror.trendsTitle")}</h3>
      {isEmpty ? (
        <p className="mt-2 text-stone-400">{t("palace:mirror.trendsEmpty")}</p>
      ) : (
        <div className="mt-2">
          <TrendLineChart
            valueDecimals={1}
            height={LAYERS_CHART_HEIGHT}
            series={[
              {
                key: "memory",
                label: t("palace:mirror.trendLayersMemoryLabel"),
                color: MEMORY_COLOR,
                data: memorySeries,
                explanation: t("palace:mirror.trendLayersMemoryNote"),
              },
              {
                key: "understanding",
                label: t("palace:mirror.trendLayersUnderstandingLabel"),
                color: UNDERSTANDING_COLOR,
                data: understandingSeries,
                explanation: t("palace:mirror.trendLayersUnderstandingNote"),
              },
              {
                key: "intuition",
                label: t("palace:mirror.trendLayersIntuitionLabel"),
                color: INTUITION_COLOR,
                data: intuitionSeries,
                explanation: t("palace:mirror.trendLayersIntuitionNote"),
              },
            ]}
          />
        </div>
      )}
    </section>
  );
}
