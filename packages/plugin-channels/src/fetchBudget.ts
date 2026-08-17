/**
 * Purpose: the bookkeeping half of fetch discipline — per-source minimum interval, a daily
 * request budget that resets at local midnight, and exponential backoff after consecutive
 * failures. Pure in-memory state with an injected clock, so polls stay deterministic under test.
 * Main exports: FetchBudgetLedger, FetchBudgetSnapshot.
 */
import {
  defaultBaseBackoffMilliseconds,
  defaultMaximumBackoffMilliseconds,
  type FetchSkipReason,
} from "./fetchContract";

export interface FetchBudgetSnapshot {
  lastRequestAtMilliseconds: number | null;
  requestsSpentToday: number;
  budgetDayKey: string;
  consecutiveFailureCount: number;
  nextAttemptAtMilliseconds: number | null;
}

export interface FetchAllowance {
  allowed: boolean;
  reason: FetchSkipReason | null;
}

interface LedgerOptions {
  now?: () => number;
  baseBackoffMilliseconds?: number;
  maximumBackoffMilliseconds?: number;
}

/** Local calendar day, so "today's budget" matches what the reader would call today. */
function localDayKey(timestampMilliseconds: number): string {
  const date = new Date(timestampMilliseconds);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function emptySnapshot(dayKey: string): FetchBudgetSnapshot {
  return {
    lastRequestAtMilliseconds: null,
    requestsSpentToday: 0,
    budgetDayKey: dayKey,
    consecutiveFailureCount: 0,
    nextAttemptAtMilliseconds: null,
  };
}

export class FetchBudgetLedger {
  private readonly states = new Map<string, FetchBudgetSnapshot>();
  private readonly now: () => number;
  private readonly baseBackoffMilliseconds: number;
  private readonly maximumBackoffMilliseconds: number;

  constructor(options: LedgerOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.baseBackoffMilliseconds =
      options.baseBackoffMilliseconds ?? defaultBaseBackoffMilliseconds;
    this.maximumBackoffMilliseconds =
      options.maximumBackoffMilliseconds ?? defaultMaximumBackoffMilliseconds;
  }

  /** Reads the state, rolling the daily counter over first when the date has changed. */
  snapshot(sourceId: string): FetchBudgetSnapshot {
    const today = localDayKey(this.now());
    const existing = this.states.get(sourceId);
    if (!existing) {
      const created = emptySnapshot(today);
      this.states.set(sourceId, created);
      return created;
    }
    if (existing.budgetDayKey !== today) {
      existing.budgetDayKey = today;
      existing.requestsSpentToday = 0;
    }
    return existing;
  }

  /** Whether this source may spend a request right now, and if not, which rule stopped it. */
  checkAllowance(
    sourceId: string,
    policy: { minimumIntervalMilliseconds: number; dailyRequestBudget: number },
  ): FetchAllowance {
    const state = this.snapshot(sourceId);
    const now = this.now();
    if (state.nextAttemptAtMilliseconds !== null && now < state.nextAttemptAtMilliseconds) {
      return { allowed: false, reason: "backoff" };
    }
    if (state.requestsSpentToday >= policy.dailyRequestBudget) {
      return { allowed: false, reason: "daily-budget" };
    }
    if (
      state.lastRequestAtMilliseconds !== null &&
      now - state.lastRequestAtMilliseconds < policy.minimumIntervalMilliseconds
    ) {
      return { allowed: false, reason: "minimum-interval" };
    }
    return { allowed: true, reason: null };
  }

  /** Spends one unit of the daily budget and starts the minimum-interval clock. */
  recordRequestStarted(sourceId: string): void {
    const state = this.snapshot(sourceId);
    state.lastRequestAtMilliseconds = this.now();
    state.requestsSpentToday += 1;
  }

  /** Clears the backoff. A 304 counts as success: the source answered. */
  recordSuccess(sourceId: string): void {
    const state = this.snapshot(sourceId);
    state.consecutiveFailureCount = 0;
    state.nextAttemptAtMilliseconds = null;
  }

  recordFailure(sourceId: string): void {
    const state = this.snapshot(sourceId);
    state.consecutiveFailureCount += 1;
    const doubled =
      this.baseBackoffMilliseconds * 2 ** Math.min(state.consecutiveFailureCount - 1, 30);
    const delay = Math.min(doubled, this.maximumBackoffMilliseconds);
    state.nextAttemptAtMilliseconds = this.now() + delay;
  }
}
