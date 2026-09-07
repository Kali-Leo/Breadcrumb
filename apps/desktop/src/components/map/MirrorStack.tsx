/**
 * Purpose: the palace right rail's remaining mirror cards — the activity heatmap and the
 * trend curves. Hidden entirely when the feedbackLab switch is off.
 * Main exports: MirrorStack.
 */
import { useSettingsStore } from "../../stores/settingsStore";
import { FeedbackHeatmapSection } from "../feedback/FeedbackHeatmapSection";
import { FeedbackTrendsSection } from "../feedback/FeedbackTrendsSection";

export function MirrorStack() {
  const enabled = useSettingsStore((state) => state.featureSwitches.feedbackLab);
  if (!enabled) return null;

  return (
    <div data-tour="mirror" className="flex flex-col gap-3 text-xs">
      <FeedbackHeatmapSection />
      <FeedbackTrendsSection />
    </div>
  );
}
