/**
 * Purpose: tiny helpers for ids and timestamps used across the app, plus a shared local-day
 * rollover watcher so every daily gate (companion helpers, diglot word budget) re-checks
 * itself at midnight instead of only once per process (Duolingo model).
 * Main exports: newId(), nowIso(), todayLocalMidnightIso(), onLocalDayChange().
 */

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** ISO instant of local midnight — the lower bound for "today's cost". */
export function todayLocalMidnightIso(): string {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return midnight.toISOString();
}

/** Cheap poll interval for day-rollover detection — a `setInterval` timer, not an app-level
 * scheduler, so this stays a plain comparison rather than anything precise. */
const DAY_CHANGE_POLL_MS = 60_000;

/** Fires `callback` whenever the local calendar day changes while the app stays open (an
 * app left running across midnight must not keep serving yesterday's daily gates until
 * restart). Detected by comparing the local-midnight ISO on a 60s interval, plus an
 * immediate re-check on window "focus" (catches rollovers that happened while the tab/app
 * was backgrounded and the interval was throttled by the OS/browser). Returns an
 * unsubscribe that clears both the interval and the focus listener. */
export function onLocalDayChange(callback: () => void): () => void {
  let lastMidnightIso = todayLocalMidnightIso();
  const checkForRollover = (): void => {
    const currentMidnightIso = todayLocalMidnightIso();
    if (currentMidnightIso !== lastMidnightIso) {
      lastMidnightIso = currentMidnightIso;
      callback();
    }
  };
  const intervalId = setInterval(checkForRollover, DAY_CHANGE_POLL_MS);
  window.addEventListener("focus", checkForRollover);
  return () => {
    clearInterval(intervalId);
    window.removeEventListener("focus", checkForRollover);
  };
}
