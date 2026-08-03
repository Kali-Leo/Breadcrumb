/**
 * Purpose: bottom action bar for a clicked overlay node (spec 017 #2) — the same self-
 * statement actions as LabGoalGapActions (我已经会了/先跳过), reusing plannerStore's actions so
 * the click immediately redraws the overlay via the store's normal recompute path.
 * Main exports: OverlayNodeActions.
 */
import type { OverlayNode } from "../../lib/overlayModel";
import { usePlannerStore } from "../../stores/plannerStore";

const actionButtonClass =
  "rounded border border-stone-200 px-2 py-1 text-stone-500 transition-colors hover:border-amber-400 hover:text-amber-700";

export function OverlayNodeActions({ node, onClose }: { node: OverlayNode; onClose(): void }) {
  const claimNodeLearned = usePlannerStore((state) => state.claimNodeLearned);
  const skipGoalNode = usePlannerStore((state) => state.skipGoalNode);

  async function claim() {
    await claimNodeLearned(node.id);
    onClose();
  }

  async function skip() {
    await skipGoalNode(node.id);
    onClose();
  }

  return (
    <div className="flex items-center justify-between gap-2 border-stone-200 border-t bg-white px-4 py-2 text-xs">
      <span className="font-medium text-stone-600">「{node.label}」</span>
      <span className="flex gap-1">
        <button type="button" className={actionButtonClass} onClick={() => void claim()}>
          我已经会了
        </button>
        <button type="button" className={actionButtonClass} onClick={() => void skip()}>
          先跳过
        </button>
        <button type="button" className={actionButtonClass} onClick={onClose}>
          关闭
        </button>
      </span>
    </div>
  );
}
