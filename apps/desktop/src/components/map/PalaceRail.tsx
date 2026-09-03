/**
 * Purpose: the palace's LEFT rail content (spec 050 §5, Leo: goals and continue-from-here
 * live on the left, not the conversation history) — shown in the sidebar while the palace
 * view is active. The goal card appears in ranked mode and opens the goal view via the app
 * bus (the goal view is palace-internal state).
 *
 * On a stacked screen the sidebar is a drawer, so the palace page itself lays these cards in
 * a row across the top of the map (MapView) and the drawer's copy steps aside: the same
 * cards must never show twice.
 * Main exports: PalaceRail.
 */
import { appEventBus } from "../../stores/chatStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { ContinueCard } from "./ContinueCard";
import { GoalCard } from "./GoalCard";
import { RecommendTuningCard } from "./RecommendTuningCard";

interface PalaceRailProps {
  /** "column" is the sidebar's (hidden while stacked); "row" is the palace page's own. */
  layout?: "column" | "row";
}

const COLUMN = "flex flex-col gap-3 px-1 pb-2 stacked:hidden";
const ROW = "grid grid-cols-1 gap-3 px-3 pt-3 sm:grid-cols-2 lg:grid-cols-3";

export function PalaceRail({ layout = "column" }: PalaceRailProps) {
  const learningMode = useSettingsStore((state) => state.learningMode);
  return (
    <div className={layout === "row" ? ROW : COLUMN}>
      {learningMode === "ranked" && (
        <GoalCard onOpenGoalView={() => appEventBus.emit("palace:openGoalView", {})} />
      )}
      <ContinueCard />
      <RecommendTuningCard />
    </div>
  );
}
