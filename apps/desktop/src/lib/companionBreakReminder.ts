/**
 * Purpose: pure break-reminder state transitions for companion/teach sessions (spec 037) —
 * wraps plugin-companion's shouldRemindBreak/nextBreakReminderAt with the "dismiss, then
 * reappear only after another full interval of continued activity" rule the store needs.
 * No I/O, no clock reads except the passed-in `nowMs` — fully unit-testable.
 * Main exports: BreakReminderState, recordCompanionActivity, dismissBreakReminder.
 */
import { nextBreakReminderAt, shouldRemindBreak } from "@breadcrumb/plugin-companion";

export interface BreakReminderState {
  activityTimestampsMs: readonly number[];
  breakReminderActive: boolean;
  /** Earliest moment the reminder is allowed to fire again after being dismissed; null before
   * the first dismissal (the reminder is free to fire as soon as the interval is reached). */
  nextBreakReminderDueMs: number | null;
}

export const INITIAL_BREAK_REMINDER_STATE: BreakReminderState = {
  activityTimestampsMs: [],
  breakReminderActive: false,
  nextBreakReminderDueMs: null,
};

/** Records one activity timestamp (a companion/teach message send) and recomputes whether the
 * break banner should show. Once the continuous span crosses the 2h interval, the banner stays
 * active every call until dismissed; a gap that resets the span (see shouldRemindBreak) also
 * clears the active flag without touching nextBreakReminderDueMs. */
export function recordCompanionActivity(
  current: BreakReminderState,
  nowMs: number,
): BreakReminderState {
  const activityTimestampsMs = [...current.activityTimestampsMs, nowMs];
  const remindNow = shouldRemindBreak(activityTimestampsMs, nowMs);
  if (!remindNow) {
    return { ...current, activityTimestampsMs, breakReminderActive: false };
  }
  const isDue = current.nextBreakReminderDueMs === null || nowMs >= current.nextBreakReminderDueMs;
  return {
    activityTimestampsMs,
    breakReminderActive: isDue,
    nextBreakReminderDueMs: isDue ? nextBreakReminderAt(nowMs) : current.nextBreakReminderDueMs,
  };
}

/** Hides the banner and pushes the next allowed reminder a full interval into the future —
 * it reappears only after that much more continued activity, not on the very next message. */
export function dismissBreakReminder(
  current: BreakReminderState,
  nowMs: number,
): BreakReminderState {
  return {
    ...current,
    breakReminderActive: false,
    nextBreakReminderDueMs: nextBreakReminderAt(nowMs),
  };
}
