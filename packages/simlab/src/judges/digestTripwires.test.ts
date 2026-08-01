/**
 * Purpose: self-check tests proving the digest-based tripwires fire on injected bad data and
 * stay silent on a healthy sequence of day digests.
 */
import { describe, expect, it } from "vitest";
import type { DayDigest } from "../runner/dayDigest";
import { checkDigestReconciliation, checkFrontierStaleness } from "./digestTripwires";

function digest(overrides: Partial<DayDigest> & { day: number }): DayDigest {
  return {
    dateIso: "2026-08-01T00:00:00.000Z",
    nodeCount: 0,
    newNodeLabelsToday: [],
    edgesAddedToday: 0,
    edgesRejectedToday: 0,
    topMasteryChanges: [],
    frontierTop5: [],
    goals: [],
    interestAggregate: { avgCuriosity: 0, avgConfusion: 0, avgBoredom: 0 },
    ...overrides,
  };
}

describe("checkDigestReconciliation", () => {
  it("passes when nodeCount delta matches newNodeLabelsToday.length every day", () => {
    const digests = [
      digest({ day: 0, nodeCount: 2, newNodeLabelsToday: ["A", "B"] }),
      digest({ day: 1, nodeCount: 3, newNodeLabelsToday: ["C"] }),
      digest({ day: 2, nodeCount: 3, newNodeLabelsToday: [] }), // no growth, no new labels
    ];
    expect(checkDigestReconciliation(digests)).toEqual([]);
  });

  it("fires when nodeCount grew more than newNodeLabelsToday accounts for (injected bad data, S5 regression shape)", () => {
    // nodeCount jumped by 2 (e.g. a tree node + an uncounted method node) but only one label
    // was reported — exactly the shape the S5 bug produced before the fix.
    const digests = [digest({ day: 0, nodeCount: 2, newNodeLabelsToday: ["A"] })];
    const violations = checkDigestReconciliation(digests);
    expect(violations).toEqual([
      {
        kind: "digest-reconciliation-mismatch",
        detail: "day 0: nodeCount delta 2 != newNodeLabelsToday.length 1",
      },
    ]);
  });

  it("accounts for day 0 against an empty starting tree", () => {
    const digests = [digest({ day: 0, nodeCount: 0, newNodeLabelsToday: [] })];
    expect(checkDigestReconciliation(digests)).toEqual([]);
  });
});

describe("checkFrontierStaleness", () => {
  const frontierA = [{ label: "费曼技巧", score: 1, reason: "无前置门槛，直接可学" }];

  it("reports no staleness when the frontier changes alongside node growth", () => {
    const digests = [
      digest({ day: 0, nodeCount: 1, frontierTop5: frontierA }),
      digest({
        day: 1,
        nodeCount: 2,
        frontierTop5: [{ label: "递归", score: 2, reason: "x" }],
      }),
    ];
    const result = checkFrontierStaleness(digests);
    expect(result).toEqual({ maxStaleStreak: 0, staleBoundaryCount: 0 });
  });

  it("does not flag a single stale day (below the >=2 WARN threshold)", () => {
    const digests = [
      digest({ day: 0, nodeCount: 1, frontierTop5: frontierA }),
      digest({ day: 1, nodeCount: 2, frontierTop5: frontierA }), // stale once
      digest({ day: 2, nodeCount: 2, frontierTop5: frontierA }), // no growth: not stale
    ];
    const result = checkFrontierStaleness(digests);
    expect(result.maxStaleStreak).toBe(1);
  });

  it("fires when the frontier stays byte-identical across >=2 consecutive day boundaries while nodes keep growing (P1 shape, injected bad data)", () => {
    const digests = [
      digest({ day: 0, nodeCount: 1, frontierTop5: frontierA }),
      digest({ day: 1, nodeCount: 2, frontierTop5: frontierA }),
      digest({ day: 2, nodeCount: 3, frontierTop5: frontierA }),
      digest({ day: 3, nodeCount: 4, frontierTop5: frontierA }),
    ];
    const result = checkFrontierStaleness(digests);
    expect(result.maxStaleStreak).toBe(3);
    expect(result.staleBoundaryCount).toBe(3);
  });
});
