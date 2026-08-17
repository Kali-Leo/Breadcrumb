/**
 * Purpose: the discovery feed's one shared restock task (spec 053 §3). Every entry point — the
 * app-start warm-up, a mount-triggered load, the end of the feed — awaits the SAME round instead
 * of one bailing out on another's loading flag, which used to leave cards written to the database
 * and never displayed (handoff 2026-08-17 §五.a). The fire-and-forget form records what goes wrong
 * behind the grid instead of surfacing it as an unhandled rejection.
 * Side effects: runs a restock round; writes one ai_failures row when one fails.
 * Main exports: runRefill, restockBehindTheGrid.
 */
import { type RefillOutcome, refillDiscoveryPool } from "./discoveryRefill";
import { recordAiFailure } from "./failureLog";

let refillTask: Promise<RefillOutcome> | null = null;

export function runRefill(force: boolean): Promise<RefillOutcome> {
  if (refillTask === null) {
    refillTask = refillDiscoveryPool({ force }).finally(() => {
      refillTask = null;
    });
  }
  return refillTask;
}

/**
 * The restock the reader never waits for. Whatever goes wrong behind the grid — a channel layer
 * that threw, a database that closed under it — is written to ai_failures and shown nowhere: the
 * cards on screen are still readable, so the reader is missing nothing and has nothing to be told
 * (product principle 1). Without the catch it surfaced as a bare unhandled rejection with no
 * record of what failed.
 */
export function restockBehindTheGrid(afterStocked: () => Promise<void>): void {
  void runRefill(false)
    .then(afterStocked)
    .catch((error: unknown) => recordAiFailure("discovery", error));
}
