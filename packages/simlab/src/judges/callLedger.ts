/**
 * Purpose: tallies success/failure counts per LLM-call purpose across a run, feeding the
 * crossCutting.zodFailureRateByPurpose metric. Threaded alongside the cost guard through the
 * journey runner: every successful chatJson/chatStream call increments a success counter,
 * every caught PipelineFailure/action failure increments a failure counter.
 * Main exports: createCallLedger, CallLedger, PurposeTally.
 */

export interface PurposeTally {
  success: number;
  failure: number;
}

export interface CallLedger {
  recordSuccess(purpose: string): void;
  recordFailure(purpose: string): void;
  snapshot(): Record<string, PurposeTally>;
}

export function createCallLedger(): CallLedger {
  const tallies = new Map<string, PurposeTally>();

  function tallyFor(purpose: string): PurposeTally {
    const existing = tallies.get(purpose);
    if (existing) return existing;
    const created: PurposeTally = { success: 0, failure: 0 };
    tallies.set(purpose, created);
    return created;
  }

  return {
    recordSuccess(purpose) {
      tallyFor(purpose).success += 1;
    },
    recordFailure(purpose) {
      tallyFor(purpose).failure += 1;
    },
    snapshot() {
      return Object.fromEntries(tallies.entries());
    },
  };
}

/** Failure rate per purpose (failure / (success + failure)); 0 for a purpose never attempted. */
export function purposeFailureRates(tallies: Record<string, PurposeTally>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(tallies).map(([purpose, tally]) => {
      const total = tally.success + tally.failure;
      return [purpose, total === 0 ? 0 : tally.failure / total];
    }),
  );
}
