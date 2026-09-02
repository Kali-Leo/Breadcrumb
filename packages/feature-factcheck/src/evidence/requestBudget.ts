/**
 * Purpose: a time budget for one outbound request that is released the moment the work
 * settles. `AbortSignal.timeout` cannot be cancelled, and the Tauri http plugin's abort
 * listener fires `fetch_cancel` on a response that was already fully read — an unhandled
 * "resource id is invalid" rejection on every completed request (seen in the 2026-09-02
 * walkthrough, five per fact-check). Clearing the timer once the body is consumed means the
 * abort never fires late.
 * Main exports: withRequestBudget.
 */

/** Runs `work` with a signal that aborts after `timeoutMs`, and disarms the timer as soon as
 * the work settles either way, so a finished request can never be cancelled after the fact. */
export async function withRequestBudget<Result>(
  timeoutMs: number,
  work: (signal: AbortSignal) => Promise<Result>,
): Promise<Result> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("request budget exhausted", "TimeoutError")),
    timeoutMs,
  );
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
