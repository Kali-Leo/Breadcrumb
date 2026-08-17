/**
 * Purpose: unit tests for the fetch bookkeeping — minimum interval between polls, the daily
 * request budget and its midnight rollover, and exponential backoff after consecutive failures
 * with a ceiling and a reset on the first success.
 */
import { describe, expect, it } from "vitest";
import { FetchBudgetLedger } from "./fetchBudget";

const policy = { minimumIntervalMilliseconds: 60_000, dailyRequestBudget: 3 };

function ledgerAt(startMilliseconds: number) {
  let clock = startMilliseconds;
  const ledger = new FetchBudgetLedger({
    now: () => clock,
    baseBackoffMilliseconds: 1000,
    maximumBackoffMilliseconds: 8000,
  });
  return { ledger, advance: (delta: number) => (clock += delta) };
}

const noon = new Date("2026-08-17T12:00:00").getTime();

describe("FetchBudgetLedger minimum interval", () => {
  it("allows the first request and blocks a second one inside the interval", () => {
    const { ledger, advance } = ledgerAt(noon);
    expect(ledger.checkAllowance("sspai", policy).allowed).toBe(true);
    ledger.recordRequestStarted("sspai");
    advance(59_000);
    expect(ledger.checkAllowance("sspai", policy)).toEqual({
      allowed: false,
      reason: "minimum-interval",
    });
    advance(2_000);
    expect(ledger.checkAllowance("sspai", policy).allowed).toBe(true);
  });

  it("tracks each source separately", () => {
    const { ledger } = ledgerAt(noon);
    ledger.recordRequestStarted("sspai");
    expect(ledger.checkAllowance("juejin", policy).allowed).toBe(true);
  });
});

describe("FetchBudgetLedger daily budget", () => {
  it("stops the source once the day's requests are spent", () => {
    const { ledger, advance } = ledgerAt(noon);
    for (let spent = 0; spent < 3; spent += 1) {
      expect(ledger.checkAllowance("sspai", policy).allowed).toBe(true);
      ledger.recordRequestStarted("sspai");
      advance(60_000);
    }
    expect(ledger.checkAllowance("sspai", policy)).toEqual({
      allowed: false,
      reason: "daily-budget",
    });
    expect(ledger.snapshot("sspai").requestsSpentToday).toBe(3);
  });

  it("refills the budget when the calendar day turns over", () => {
    const { ledger, advance } = ledgerAt(noon);
    for (let spent = 0; spent < 3; spent += 1) {
      ledger.recordRequestStarted("sspai");
      advance(60_000);
    }
    expect(ledger.checkAllowance("sspai", policy).allowed).toBe(false);
    advance(24 * 60 * 60 * 1000);
    expect(ledger.checkAllowance("sspai", policy).allowed).toBe(true);
    expect(ledger.snapshot("sspai").requestsSpentToday).toBe(0);
  });
});

describe("FetchBudgetLedger backoff", () => {
  it("doubles the wait per consecutive failure and holds it at the ceiling", () => {
    const { ledger, advance } = ledgerAt(noon);
    ledger.recordFailure("sina-tech");
    expect(ledger.snapshot("sina-tech").nextAttemptAtMilliseconds).toBe(noon + 1000);
    ledger.recordFailure("sina-tech");
    expect(ledger.snapshot("sina-tech").nextAttemptAtMilliseconds).toBe(noon + 2000);
    ledger.recordFailure("sina-tech");
    expect(ledger.snapshot("sina-tech").nextAttemptAtMilliseconds).toBe(noon + 4000);
    ledger.recordFailure("sina-tech");
    ledger.recordFailure("sina-tech");
    expect(ledger.snapshot("sina-tech").nextAttemptAtMilliseconds).toBe(noon + 8000);
    advance(500);
    expect(ledger.checkAllowance("sina-tech", policy)).toEqual({
      allowed: false,
      reason: "backoff",
    });
  });

  it("clears the backoff and the failure count on the next success", () => {
    const { ledger, advance } = ledgerAt(noon);
    ledger.recordFailure("sina-tech");
    ledger.recordFailure("sina-tech");
    advance(2000);
    expect(ledger.checkAllowance("sina-tech", policy).allowed).toBe(true);
    ledger.recordSuccess("sina-tech");
    expect(ledger.snapshot("sina-tech").consecutiveFailureCount).toBe(0);
    expect(ledger.snapshot("sina-tech").nextAttemptAtMilliseconds).toBeNull();
  });

  it("reports backoff ahead of the daily budget so a dead source reads as dead", () => {
    const { ledger, advance } = ledgerAt(noon);
    for (let spent = 0; spent < 3; spent += 1) {
      ledger.recordRequestStarted("sspai");
      advance(60_000);
    }
    ledger.recordFailure("sspai");
    expect(ledger.checkAllowance("sspai", policy).reason).toBe("backoff");
  });
});
