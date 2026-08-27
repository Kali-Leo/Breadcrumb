/**
 * Purpose: per-node self-statement actions for the selected goal's gap (re-homed by spec
 * 047) — "我已经会了" writes a direct mastery claim (no LLM call, the learner already knows
 * which node this is) and "先跳过" removes the node from the goal's set. Domain judgment
 * stays the system's job; these are only self-statements, so the list is labelled
 * neutrally, never "你还不会" (2026-08-02, spec 012 §2).
 * Main exports: GoalGapActions.
 */

import { useTranslation } from "react-i18next";
import { usePlannerStore } from "../../stores/plannerStore";

const actionButtonClass =
  "rounded border border-stone-200 px-1.5 py-0.5 text-stone-500 transition-colors hover:border-amber-400 hover:text-amber-700";

export function GoalGapActions() {
  const { t } = useTranslation("palace");
  const nodes = usePlannerStore((state) => state.nodes);
  const gap = usePlannerStore((state) => state.gap);
  const claimNodeLearned = usePlannerStore((state) => state.claimNodeLearned);
  const skipGoalNode = usePlannerStore((state) => state.skipGoalNode);

  if (gap === null || gap.gapNodeIds.length === 0) return null;

  const labelById = new Map(nodes.map((node) => [node.id, node.label]));

  return (
    <div className="space-y-1 rounded border border-stone-200 p-2">
      <p className="text-stone-500">{t("goal.gapTitle")}</p>
      <ul className="space-y-1">
        {gap.gapNodeIds.map((nodeId) => (
          <li key={nodeId} className="flex items-center justify-between gap-2">
            <span>{labelById.get(nodeId) ?? nodeId}</span>
            <span className="flex gap-1">
              <button
                type="button"
                className={actionButtonClass}
                onClick={() => void claimNodeLearned(nodeId)}
              >
                {t("goal.gapAlreadyKnow")}
              </button>
              <button
                type="button"
                className={actionButtonClass}
                onClick={() => void skipGoalNode(nodeId)}
              >
                {t("goal.gapSkip")}
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-stone-400">{t("goal.gapChangedMind")}</p>
    </div>
  );
}
