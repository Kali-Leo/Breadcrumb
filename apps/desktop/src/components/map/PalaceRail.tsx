/**
 * Purpose: the palace's LEFT rail content (spec 050 §5, Leo: goals and continue-from-here
 * live on the left, not the conversation history) — shown in the sidebar while the palace
 * view is active. The goal card appears in ranked mode and opens the goal view via the app
 * bus (the goal view is palace-internal state).
 * Main exports: PalaceRail.
 */
import { appEventBus } from "../../stores/chatStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { ContinueCard } from "./ContinueCard";
import { GoalCard } from "./GoalCard";

export function PalaceRail() {
  const learningMode = useSettingsStore((state) => state.learningMode);
  return (
    <div className="flex flex-col gap-3 px-1 pb-2">
      {learningMode === "ranked" && (
        <GoalCard onOpenGoalView={() => appEventBus.emit("palace:openGoalView", {})} />
      )}
      <ContinueCard />
    </div>
  );
}
