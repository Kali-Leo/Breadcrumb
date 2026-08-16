/**
 * Purpose: the vocabulary page (spec 050 §6, own bottom-left icon) — the language-weave
 * settings and the settled-words trend chart live together here, out of settings and out
 * of the palace rail.
 * Main exports: VocabPanel.
 */
import { FEEDBACK_COPY } from "@breadcrumb/plugin-feedback";
import { useEffect } from "react";
import { useFeedbackStore } from "../stores/feedbackStore";
import { DiglotSettingsSection } from "./DiglotSettingsSection";
import { TrendLineChart } from "./TrendLineChart";

const WORDS_SETTLED_COLOR = "#92400e";

function VocabTrendCard() {
  const trends = useFeedbackStore((state) => state.trends);
  const hasWordData = trends.wordsSettled.some((point) => point.value > 0);

  useEffect(() => {
    void useFeedbackStore.getState().loadAll();
  }, []);

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm text-xs">
      <h3 className="text-sm font-medium text-stone-700">{FEEDBACK_COPY.trendWordsTitle}</h3>
      {hasWordData ? (
        <div className="mt-2">
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
          <p className="mt-1 text-[10px] text-stone-400">{FEEDBACK_COPY.trendWordsColdStartNote}</p>
        </div>
      ) : (
        <p className="mt-1 text-stone-400">{FEEDBACK_COPY.trendsEmpty}</p>
      )}
    </section>
  );
}

export function VocabPanel() {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto bg-stone-50 p-6">
      <DiglotSettingsSection />
      <VocabTrendCard />
    </div>
  );
}
