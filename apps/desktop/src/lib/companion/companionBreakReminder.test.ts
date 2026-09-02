/**
 * Purpose: unit tests for the pure break-reminder state transitions (spec 037) — the banner
 * fires once a continuous 2h span is reached, stays active until dismissed, and only reappears
 * after another full interval of continued activity (not on the very next message).
 */
import { describe, expect, it } from "vitest";
import {
  type BreakReminderState,
  dismissBreakReminder,
  INITIAL_BREAK_REMINDER_STATE,
  recordCompanionActivity,
} from "./companionBreakReminder";

const HOUR_MS = 3_600_000;
// Well within shouldRemindBreak's 15-minute continuity threshold, so these timestamps form
// one unbroken span instead of resetting it.
const STEP_MS = 600_000;

function replay(times: readonly number[]): BreakReminderState {
  let state: BreakReminderState = INITIAL_BREAK_REMINDER_STATE;
  for (const t of times) state = recordCompanionActivity(state, t);
  return state;
}

function timesUpTo(totalMs: number): number[] {
  const times: number[] = [];
  for (let t = 0; t <= totalMs; t += STEP_MS) times.push(t);
  return times;
}

describe("recordCompanionActivity", () => {
  it("stays inactive before a continuous 2h span is reached", () => {
    const state = replay(timesUpTo(HOUR_MS));
    expect(state.breakReminderActive).toBe(false);
  });

  it("activates once a continuous span reaches 2h", () => {
    const state = replay(timesUpTo(2 * HOUR_MS));
    expect(state.breakReminderActive).toBe(true);
  });

  it("resets to inactive when activity gaps by more than 15 minutes", () => {
    const times = [...timesUpTo(HOUR_MS), HOUR_MS + 20 * 60_000];
    const state = replay(times);
    expect(state.breakReminderActive).toBe(false);
  });
});

describe("dismissBreakReminder", () => {
  it("hides the banner and does not bring it back on the very next activity", () => {
    let state = replay(timesUpTo(2 * HOUR_MS));
    expect(state.breakReminderActive).toBe(true);

    state = dismissBreakReminder(state, 2 * HOUR_MS);
    expect(state.breakReminderActive).toBe(false);

    state = recordCompanionActivity(state, 2 * HOUR_MS + STEP_MS);
    expect(state.breakReminderActive).toBe(false);
  });

  it("reappears once another full interval of continued activity has passed", () => {
    let state = replay(timesUpTo(2 * HOUR_MS));
    state = dismissBreakReminder(state, 2 * HOUR_MS);

    for (let t = 2 * HOUR_MS + STEP_MS; t <= 4 * HOUR_MS; t += STEP_MS) {
      state = recordCompanionActivity(state, t);
    }
    expect(state.breakReminderActive).toBe(true);
  });
});
