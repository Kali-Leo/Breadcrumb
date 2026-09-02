/**
 * Purpose: best-effort developer-visible failure logging for every silently-degraded AI
 * pipeline (spec 014) — writes one row to ai_failures. Never throws: a failure to record a
 * failure must not compound whatever already went wrong.
 * Main exports: degradeSilently, recordAiFailure.
 */
import { getRepos } from "./db";
import { newId, nowIso } from "./time";

/** Records one silent-degradation failure for the lab panel's "最近的静默失败" section.
 * Best-effort — swallows its own errors (e.g. the DB isn't ready yet) instead of throwing,
 * since callers invoke this from inside a catch that's already degrading silently. */
export async function recordAiFailure(purpose: string, error: unknown): Promise<void> {
  try {
    const repos = await getRepos();
    await repos.aiFailures.record({
      id: newId(),
      purpose,
      message: describeError(error),
      created_at: nowIso(),
    });
  } catch {
    // best-effort: recording a failure must never itself throw.
  }
}

/** The single call every silent degradation should make: prints the developer console line
 * AND writes the ai_failures row. A packaged build has no console anyone reads, so a warn-only
 * degradation is invisible to the audit that starts every work session — this keeps both.
 * Never throws: recordAiFailure swallows its own errors, so an unwritable log cannot compound
 * whatever already went wrong. */
export async function degradeSilently(purpose: string, error: unknown): Promise<void> {
  console.warn(`${purpose} degraded silently:`, error);
  await recordAiFailure(purpose, error);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
