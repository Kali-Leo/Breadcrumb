/**
 * Purpose: lab-panel "排位" collapsed section (spec 016), shown only in ranked mode — milestone
 * + band word, the 5-figure pseudo-ranked ladder with the learner's own row highlighted
 * inline, and a "距贯通还有 N 里程" pseudo-quantified line. Fetch-on-view only: opening never
 * auto-refreshes; "看看同行者" explicitly triggers the reuse/regenerate decision. All copy is
 * plain and never reveals the ladder is generated (spec 016 #3 anti-reveal line).
 * Main exports: LabLadderSection.
 */

import { useLadderStore } from "../stores/ladderStore";
import { usePlannerStore } from "../stores/plannerStore";
import { useSettingsStore } from "../stores/settingsStore";

export function LabLadderSection() {
  const learningMode = useSettingsStore((state) => state.learningMode);
  const selectedGoalId = usePlannerStore((state) => state.selectedGoalId);
  const ladder = useLadderStore((state) => state.ladder);
  const loading = useLadderStore((state) => state.loading);
  const viewLadder = useLadderStore((state) => state.viewLadder);

  if (learningMode !== "ranked") return null;

  return (
    <details className="rounded border border-stone-200" open>
      <summary className="cursor-pointer px-2 py-1 font-semibold text-stone-600">排位</summary>
      <div className="space-y-2 border-t border-stone-100 px-2 py-1">
        {selectedGoalId === null ? (
          <p className="text-stone-400">先选一个目标，再来看看同行者</p>
        ) : (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={() => void viewLadder(selectedGoalId)}
              className="rounded bg-amber-500 px-2 py-1 text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              {loading ? "看着…" : "看看同行者"}
            </button>
            {ladder && ladder.goalId === selectedGoalId && (
              <div className="space-y-1">
                <p className="text-stone-600">
                  里程 {ladder.milestone} · {ladder.band}
                </p>
                <ul className="space-y-0.5">
                  {ladder.rows.map((row) => (
                    <li
                      key={`${row.label}-${row.milestoneValue}`}
                      className={`flex items-center justify-between gap-2 rounded px-1 ${
                        row.isUser ? "bg-amber-100 text-stone-700" : "text-stone-500"
                      }`}
                    >
                      <span>
                        {row.label}
                        {row.note && <span className="ml-1 text-stone-400">{row.note}</span>}
                      </span>
                      <span className="shrink-0 text-stone-400">{row.milestoneValue}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-stone-400">距贯通还有 {ladder.distanceToTop} 里程</p>
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}
