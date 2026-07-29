/**
 * Purpose: tiny helpers for ids and timestamps used across the app.
 * Main exports: newId(), nowIso(), todayLocalMidnightIso().
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
