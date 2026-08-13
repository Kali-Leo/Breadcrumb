/**
 * Purpose: the 🪞 feedback lab full-page view (spec 035) — eight candidate modules for
 * "making learning visible", every one computed from local data at zero token cost.
 * Main exports: FeedbackPanel.
 */
import { FEEDBACK_COPY } from "@breadcrumb/plugin-feedback";
import { useEffect } from "react";
import { useFeedbackStore } from "../stores/feedbackStore";
import { useSettingsStore } from "../stores/settingsStore";
import { FeedbackDailyBiteSection } from "./FeedbackDailyBiteSection";
import { FeedbackEvidenceSection } from "./FeedbackEvidenceSection";
import { FeedbackHeatmapSection } from "./FeedbackHeatmapSection";
import { FeedbackReunionSection } from "./FeedbackReunionSection";
import { FeedbackSettledSection } from "./FeedbackSettledSection";
import { FeedbackSmallWinsSection } from "./FeedbackSmallWinsSection";
import { FeedbackSystemGaugeSection } from "./FeedbackSystemGaugeSection";
import { FeedbackTotalsSection } from "./FeedbackTotalsSection";

export function FeedbackPanel() {
  const feedbackLabEnabled = useSettingsStore((state) => state.featureSwitches.feedbackLab);
  const loaded = useFeedbackStore((state) => state.loaded);

  useEffect(() => {
    if (feedbackLabEnabled) {
      void useFeedbackStore.getState().loadAll();
    }
  }, [feedbackLabEnabled]);

  if (!feedbackLabEnabled) {
    return (
      <div className="flex h-full items-center justify-center bg-stone-50">
        <p className="text-center text-sm leading-relaxed text-stone-400">
          {FEEDBACK_COPY.disabledTitle}
          <br />
          {FEEDBACK_COPY.disabledHint}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-stone-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 text-xs">
        <p className="text-[11px] text-stone-400">{FEEDBACK_COPY.panelIntro}</p>
        {!loaded ? (
          <p className="text-stone-400">{FEEDBACK_COPY.loading}</p>
        ) : (
          <>
            <FeedbackHeatmapSection />
            <FeedbackSmallWinsSection />
            <FeedbackTotalsSection />
            <FeedbackReunionSection />
            <FeedbackDailyBiteSection />
            <FeedbackSystemGaugeSection />
            <FeedbackSettledSection />
            <FeedbackEvidenceSection />
          </>
        )}
      </div>
    </div>
  );
}
