/**
 * Purpose: tiny helpers for ids and timestamps used across the app, plus a shared local-day
 * rollover watcher so every daily gate (companion helpers, diglot word budget) re-checks
 * itself at midnight instead of only once per process (Duolingo model).
 * Main exports: newId(), nowIso(), todayLocalMidnightIso(), onLocalDayChange().
 */

/**
 * A random v4 UUID.
 *
 * `crypto.randomUUID` is the whole implementation on any origin that counts as a secure
 * context, which the shipped app always is (Tauri's custom protocol, and https for the
 * browser edition). It is missing on one that is not — the method is [SecureContext]-gated —
 * and the origin that is not is the one we test iPads from: `vite preview` served to a tablet
 * over the LAN is plain http, where the call is a TypeError rather than a degraded id, and it
 * is reached before the first screen renders. So the same randomness is assembled by hand
 * there instead: `crypto.getRandomValues` carries no such gate, and it is the source
 * `randomUUID` itself draws on, so the fallback is the same 122 bits from the same CSPRNG —
 * a different way of writing them down, not a weaker id. Version and variant bits per
 * RFC 4122 §4.4. Never Math.random: an id that lands in the database as a merge key and a
 * cross-device identity must not be predictable.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
