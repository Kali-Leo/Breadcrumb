/**
 * Purpose: the palace right rail's remaining mirror cards (spec 048 §1, Leo's selection) —
 * the activity heatmap and the settled list. Hidden entirely when the feedbackLab switch
 * is off (product principle 3).
 * Main exports: MirrorStack.
 */
import { useSettingsStore } from "../../stores/settingsStore";
import { FeedbackHeatmapSection } from "../FeedbackHeatmapSection";
import { FeedbackSettledSection } from "../FeedbackSettledSection";

export function MirrorStack() {
  const enabled = useSettingsStore((state) => state.featureSwitches.feedbackLab);
  if (!enabled) return null;

  return (
    <div className="flex flex-col gap-3 text-xs">
      <FeedbackHeatmapSection />
      <FeedbackSettledSection />
    </div>
  );
}
