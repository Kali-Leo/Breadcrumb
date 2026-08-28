/**
 * Purpose: research-task executor (spec 036) — validates, verifies signature, enforces the
 * run-once and time-budget guards, snapshots aggregate results for the panel. Failures are
 * recorded silently (ai_failures path); the UI never surfaces them.
 * Main exports: runPendingResearchTasks, ResearchExecutorDeps, TASK_TIME_BUDGET_MS.
 */
import { createResearchRepo, type SqlClient } from "@breadcrumb/core-db";
import { executeStatCall } from "./statistics";
import type { StatResult } from "./statResults";
import { parseSignedResearchTask } from "./taskSchema";
import { verifyResearchTaskSignature } from "./taskSignature";

/** A single task may not hold the (idle) main thread longer than this. */
export const TASK_TIME_BUDGET_MS = 5000;

/**
 * `expiresAt` is a date, not an instant: a task that expires on the 13th is valid all through
 * the 13th. Comparing the bare date string against a full ISO instant (as this used to) made
 * "2026-08-13" sort before "2026-08-13T10:00:00.000Z", retiring every task a whole day early.
 */
function hasExpired(expiresAt: string, now: Date): boolean {
  return `${expiresAt.slice(0, 10)}T23:59:59.999Z` < now.toISOString();
}

export interface ResearchExecutorDeps {
  sql: SqlClient;
  now: () => Date;
  /** Best-effort silent failure sink — wired to the ai_failures repo by the host app. */
  recordFailure: (message: string) => Promise<void>;
  /** Test seam; defaults to the real public key. */
  publicKeyHex?: string;
}

/**
 * Runs every not-yet-run, unexpired, correctly signed task and stores its result.
 * Invalid or tampered inputs are dropped silently. Returns the number of tasks executed.
 */
export async function runPendingResearchTasks(
  rawTasks: readonly unknown[],
  deps: ResearchExecutorDeps,
): Promise<number> {
  const repo = createResearchRepo(deps.sql);
  const alreadyRan = new Set(await repo.listRunTaskIds());
  let executed = 0;
  for (const raw of rawTasks) {
    let taskId = "unknown";
    try {
      const signed = parseSignedResearchTask(raw);
      taskId = signed.payload.id;
      if (alreadyRan.has(taskId)) continue;
      if (!verifyResearchTaskSignature(signed, deps.publicKeyHex)) {
        await deps.recordFailure(`task ${taskId}: signature verification failed`);
        continue;
      }
      const task = signed.payload;
      const startedAt = deps.now();
      if (hasExpired(task.expiresAt, startedAt)) continue;
      const results: StatResult[] = [];
      for (const call of task.calls) {
        if (deps.now().getTime() - startedAt.getTime() > TASK_TIME_BUDGET_MS) {
          throw new Error(`time budget exceeded after ${results.length} calls`);
        }
        results.push(await executeStatCall(call, deps.sql, deps.now()));
      }
      const computedAt = deps.now().toISOString();
      await repo.saveResult({
        id: `research-${taskId}`,
        task_id: taskId,
        institution: task.institution,
        title: task.title,
        purpose: task.purpose,
        ethics_note: task.ethicsNote ?? null,
        display_json: JSON.stringify(task.display),
        results_json: JSON.stringify(results),
        computed_at: computedAt,
      });
      await repo.recordRun(taskId, computedAt);
      alreadyRan.add(taskId);
      executed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await deps.recordFailure(`task ${taskId}: ${message}`).catch(() => undefined);
      // A task that exceeded its budget is retired, not retried forever.
      if (taskId !== "unknown" && message.startsWith("time budget")) {
        await repo.recordRun(taskId, deps.now().toISOString()).catch(() => undefined);
      }
    }
  }
  return executed;
}
