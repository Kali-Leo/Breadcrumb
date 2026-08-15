/**
 * Purpose: the palace context stack's world-layer content (spec 046) — the graduated
 * mirror modules ("this stretch of time"), shown when the learner isn't pointing at any
 * island. Hidden entirely when the feedbackLab switch is off (product principle 3).
 * Main exports: MirrorStack.
 */
import { useSettingsStore } from "../../stores/settingsStore";
import { FeedbackEvidenceSection } from "../FeedbackEvidenceSection";
import { FeedbackHeatmapSection } from "../FeedbackHeatmapSection";
import { FeedbackReunionSection } from "../FeedbackReunionSection";
import { FeedbackSettledSection } from "../FeedbackSettledSection";
import { FeedbackSmallWinsSection } from "../FeedbackSmallWinsSection";
import { FeedbackTotalsSection } from "../FeedbackTotalsSection";

export function MirrorStack() {
  const enabled = useSettingsStore((state) => state.featureSwitches.feedbackLab);
  if (!enabled) return null;

  // Calm ordering: concrete recent facts first, inspection tooling (collapsed) last.
  return (
    <div className="flex flex-col gap-3 text-xs">
      <p className="text-[11px] text-stone-400">这段时间</p>
      <FeedbackSmallWinsSection />
      <FeedbackHeatmapSection />
      <FeedbackSettledSection />
      <FeedbackTotalsSection />
      <FeedbackReunionSection />
      <FeedbackEvidenceSection />
    </div>
  );
}
