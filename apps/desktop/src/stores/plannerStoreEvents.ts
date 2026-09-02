/**
 * Purpose: wires an arbitrary recompute callback to every app-bus event that can change
 * frontier candidates or a selected goal's gap — split out of plannerStore.ts purely to keep
 * that file under the file-size ceiling. Takes the callback as a parameter (rather than
 * importing usePlannerStore itself) so this module has no dependency back on the store file.
 * Main exports: registerRecomputeSubscriptions.
 */
import { degradeSilently } from "../lib/platform/failureLog";
import { appEventBus } from "./chatStore";

/** Subscribes `recompute` to knowledge:edgesUpdated, interest:updated, mastery:updated and
 * knowledge:nodesExtracted. Recompute is best-effort background work: a failure must warn,
 * never surface as an unhandled rejection (the app-wide dev black box would show it as a
 * crash). */
export function registerRecomputeSubscriptions(recompute: () => Promise<void>): void {
  function recomputeSafely(): void {
    recompute().catch((error: unknown) => degradeSilently("planner", error));
  }
  appEventBus.on("knowledge:edgesUpdated", recomputeSafely);
  appEventBus.on("interest:updated", recomputeSafely);
  appEventBus.on("mastery:updated", recomputeSafely);
  appEventBus.on("knowledge:nodesExtracted", recomputeSafely);
}
