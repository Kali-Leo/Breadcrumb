/**
 * Purpose: hover tooltip for one overlay node (spec 017 #2) — label + 掌握度/兴趣/依据,
 * positioned next to the cursor. Pure presentational, no store access.
 * Main exports: OverlayNodeTooltip.
 */
import type { OverlayNode } from "../../lib/overlayModel";

const CURSOR_OFFSET = 14;
const THIN_EVIDENCE_THRESHOLD = 1;

export function OverlayNodeTooltip({
  node,
  position,
}: {
  node: OverlayNode;
  position: { x: number; y: number };
}) {
  return (
    <div
      className="pointer-events-none fixed z-50 rounded border border-stone-200 bg-white px-2 py-1 text-xs shadow-md"
      style={{ left: position.x + CURSOR_OFFSET, top: position.y + CURSOR_OFFSET }}
    >
      <p className="font-medium text-stone-700">{node.label}</p>
      <p className="text-stone-500">掌握度 {(node.mastery * 100).toFixed(0)}%</p>
      <p className="text-stone-500">兴趣 {(node.interest * 100).toFixed(0)}%</p>
      <p className="text-stone-400">
        依据 {node.evidenceWeight < THIN_EVIDENCE_THRESHOLD ? "尚少" : "充分"}
      </p>
    </div>
  );
}
