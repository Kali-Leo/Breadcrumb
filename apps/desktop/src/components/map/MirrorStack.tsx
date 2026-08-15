/**
 * Purpose: the palace right rail's remaining mirror cards (spec 048 §1, Leo's selection) —
 * the activity heatmap and the trend curves. Hidden entirely when the feedbackLab switch
 * is off (product principle 3).
 * Main exports: MirrorStack.
 */
import { useSettingsStore } from "../../stores/settingsStore";
import { FeedbackHeatmapSection } from "../FeedbackHeatmapSection";
import { FeedbackTrendsSection } from "../FeedbackTrendsSection";

export function MirrorStack() {
  const enabled = useSettingsStore((state) => state.featureSwitches.feedbackLab);
  if (!enabled) return null;

  return (
    <div className="flex flex-col gap-3 text-xs">
      <FeedbackHeatmapSection />
      <FeedbackTrendsSection />
    </div>
  );
}
