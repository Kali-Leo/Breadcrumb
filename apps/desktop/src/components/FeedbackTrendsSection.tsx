/**
 * Purpose: the palace rail's "趋势" card (spec 035 T7a; removed in spec 046, restored on
 * Leo's ruling) — a three-layer estimate curve (memory / understanding / intuition, all
 * forgetting-decayed) plus the settled word-progress line, each measured only against the
 * past self, no target lines.
 * Main exports: FeedbackTrendsSection.
 */
import { FEEDBACK_COPY, type TrendPoint } from "@breadcrumb/plugin-feedback";
import type { ReactNode } from "react";
import { useFeedbackStore } from "../stores/feedbackStore";
import { TrendLineChart } from "./TrendLineChart";

// Already run through the six-point accessibility checklist (contrast against white and
// against each other): amber for memory, teal for understanding, violet for intuition.
const MEMORY_COLOR = "#d97706";
const UNDERSTANDING_COLOR = "#0d9488";
const INTUITION_COLOR = "#6d28d9";
const WORDS_SETTLED_COLOR = "#92400e";
const LAYERS_CHART_HEIGHT = 200;

function TrendCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div>
      {title !== undefined && <p className="mb-1 text-stone-500">{title}</p>}
      {children}
    </div>
  );
}

export function FeedbackTrendsSection() {
  const trends = useFeedbackStore((state) => state.trends);
  const isEmpty = trends.layers.every((point) => point.memory === 0);
  const hasWordData = trends.wordsSettled.some((point) => point.value > 0);

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
      <h3 className="font-semibold text-stone-600">{FEEDBACK_COPY.trendsTitle}</h3>
      <p className="mt-1 text-stone-400">{FEEDBACK_COPY.trendsHint}</p>
      {isEmpty ? (
        <p className="mt-2 text-stone-400">{FEEDBACK_COPY.trendsEmpty}</p>
      ) : (
        <div className="mt-2 flex flex-col gap-4">
          <TrendCard title={FEEDBACK_COPY.trendLayersTitle}>
            <TrendLineChart
              valueDecimals={1}
              height={LAYERS_CHART_HEIGHT}
              series={[
                {
                  key: "memory",
                  label: FEEDBACK_COPY.trendLayersMemoryLabel,
                  color: MEMORY_COLOR,
                  data: memorySeries,
                },
                {
                  key: "understanding",
                  label: FEEDBACK_COPY.trendLayersUnderstandingLabel,
                  color: UNDERSTANDING_COLOR,
                  data: understandingSeries,
                },
                {
                  key: "intuition",
                  label: FEEDBACK_COPY.trendLayersIntuitionLabel,
                  color: INTUITION_COLOR,
                  data: intuitionSeries,
                },
              ]}
            />
            <p className="mt-1 text-[10px] text-stone-400">{FEEDBACK_COPY.trendLayersNote}</p>
          </TrendCard>
          {hasWordData && (
            <TrendCard title={FEEDBACK_COPY.trendWordsTitle}>
              <TrendLineChart
                series={[
                  {
                    key: "wordsSettled",
                    label: FEEDBACK_COPY.trendWordsSettledLabel,
                    color: WORDS_SETTLED_COLOR,
                    data: trends.wordsSettled,
                  },
                ]}
              />
              <p className="mt-1 text-[10px] text-stone-400">
                {FEEDBACK_COPY.trendWordsColdStartNote}
              </p>
            </TrendCard>
          )}
        </div>
      )}
    </section>
  );
}
