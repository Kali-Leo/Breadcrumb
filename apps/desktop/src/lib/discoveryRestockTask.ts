/**
 * Purpose: the discovery feed's one shared restock task (spec 053 §3). Every entry point — the
 * app-start warm-up, a mount-triggered load, the end of the feed — awaits the SAME round instead
 * of one bailing out on another's loading flag, which used to leave cards written to the database
 * and never displayed (handoff 2026-08-17 §五.a). The fire-and-forget form records what goes wrong
 * behind the grid instead of surfacing it as an unhandled rejection.
 * Side effects: runs a restock round; writes one ai_failures row when one fails.
 * Main exports: runRefill, restockBehindTheGrid.
 */
import { type RefillOptions, type RefillOutcome, refillDiscoveryPool } from "./discoveryRefill";
import { recordAiFailure } from "./failureLog";

let refillTask: Promise<RefillOutcome> | null = null;

/**
 * The round everyone shares. A caller that needs something the round in the air was not asked for
 * — the first-run panel needs a recall pass, and the boot round ran before there was one term to
 * search for — queues behind it rather than joining it, so its request is not silently answered by
 * work that started before the reader said anything.
 */
export function runRefill(options: RefillOptions = {}): Promise<RefillOutcome> {
  const running = refillTask;
  if (running !== null && options.forceRecall !== true) return running;
  const task: Promise<RefillOutcome> = (
    running === null
      ? refillDiscoveryPool(options)
      : running.then(
          () => refillDiscoveryPool(options),
          () => refillDiscoveryPool(options),
        )
  ).finally(() => {
    if (refillTask === task) refillTask = null;
  });
  refillTask = task;
  return task;
}

/**
 * The restock the reader never waits for. Whatever goes wrong behind the grid — a channel layer
 * that threw, a database that closed under it — is written to ai_failures and shown nowhere: the
 * cards on screen are still readable, so the reader is missing nothing and has nothing to be told
 * (product principle 1). Without the catch it surfaced as a bare unhandled rejection with no
 * record of what failed.
 */
export function restockBehindTheGrid(afterStocked: () => Promise<void>): void {
  void runRefill()
    .then(afterStocked)
    .catch((error: unknown) => recordAiFailure("discovery", error));
}
