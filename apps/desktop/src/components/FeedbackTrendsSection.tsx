/**
 * Purpose: the 🪞 feedback lab's "趋势" section (spec 035 T6) — three stacked single-axis
 * line charts (concepts, Σ retrievability, word progress), each measured only against the
 * past self, no target lines.
 * Main exports: FeedbackTrendsSection.
 */
import { FEEDBACK_COPY } from "@breadcrumb/plugin-feedback";
import type { ReactNode } from "react";
import { useFeedbackStore } from "../stores/feedbackStore";
import { TrendLineChart } from "./TrendLineChart";

// Amber scale, matching the heatmap's AMBER_THEME (FeedbackHeatmapSection): a lighter step
// for the lone/leading series, a deeper step reserved for "settled".
const CONCEPTS_COLOR = "#d97706";
const KNOWLEDGE_COLOR = "#d97706";
const WORDS_SEEN_COLOR = "#d97706";
const WORDS_SETTLED_COLOR = "#92400e";

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
  const isEmpty = trends.concepts.every((point) => point.value === 0);
  const hasWordData = trends.wordsSeen.some((point) => point.value > 0);

  return (
    <section className="rounded border border-stone-200 bg-white p-3">
      <h3 className="font-semibold text-stone-600">{FEEDBACK_COPY.trendsTitle}</h3>
      <p className="mt-1 text-stone-400">{FEEDBACK_COPY.trendsHint}</p>
      {isEmpty ? (
        <p className="mt-2 text-stone-400">{FEEDBACK_COPY.trendsEmpty}</p>
      ) : (
        <div className="mt-2 flex flex-col gap-4">
          <TrendCard title={FEEDBACK_COPY.trendConceptsLabel}>
            <TrendLineChart
              series={[
                {
                  key: "concepts",
                  label: FEEDBACK_COPY.trendConceptsLabel,
                  color: CONCEPTS_COLOR,
                  data: trends.concepts,
                },
              ]}
            />
          </TrendCard>
          <TrendCard title={FEEDBACK_COPY.trendKnowledgeLabel}>
            <TrendLineChart
              valueDecimals={1}
              series={[
                {
                  key: "knowledge",
                  label: FEEDBACK_COPY.trendKnowledgeLabel,
                  color: KNOWLEDGE_COLOR,
                  data: trends.knowledge,
                },
              ]}
            />
          </TrendCard>
          {hasWordData && (
            <TrendCard>
              <TrendLineChart
                series={[
                  {
                    key: "wordsSeen",
                    label: FEEDBACK_COPY.trendWordsSeenLabel,
                    color: WORDS_SEEN_COLOR,
                    data: trends.wordsSeen,
                  },
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
      <p className="mt-2 text-[10px] text-stone-400">{FEEDBACK_COPY.trendsBasis}</p>
    </section>
  );
}
