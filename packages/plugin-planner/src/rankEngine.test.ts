/**
 * Purpose: unit tests for the rank engine's three curve properties (monotonicity, determinism,
 * diminishing marginal rank gain) plus neighbor-rank anchoring (spec 018 #1-#2).
 */
import { describe, expect, it } from "vitest";
import {
  domainFuel,
  goalDomainClosure,
  neighborRanks,
  progressFromFuel,
  progressFromRank,
  rankFromProgress,
} from "./rankEngine";

describe("domainFuel / progressFromFuel monotonicity", () => {
  it("grows with more mastery over the closure set", () => {
    const lowFuel = domainFuel(
      ["a", "b"],
      new Map([
        ["a", 0.2],
        ["b", 0.1],
      ]),
    );
    const highFuel = domainFuel(
      ["a", "b"],
      new Map([
        ["a", 0.9],
        ["b", 0.8],
      ]),
    );
    expect(highFuel).toBeGreaterThan(lowFuel);
  });

  it("is 0 for an empty closure and rises strictly with fuel", () => {
    expect(progressFromFuel(0, 10)).toBe(0);
    const closureSize = 10;
    let previous = 0;
    for (const fuel of [1, 3, 6, 10, 20, 50]) {
      const m = progressFromFuel(fuel, closureSize);
      expect(m).toBeGreaterThan(previous);
      previous = m;
    }
  });

  it("mathematically approaches but never has a formula-level cap at 100", () => {
    // The curve is a true asymptote (100 x (1 - e^-x)) that only reaches exactly 100 once
    // double-precision underflow makes e^-x indistinguishable from 0 — the formula itself has
    // no ceiling. Moderate fuel stays visibly below 100, which is what "no upper bound, no
    // finish line" (spec 018 #1) actually cares about: continued progress is always possible.
    expect(progressFromFuel(30, 10)).toBeLessThan(100);
    expect(progressFromFuel(300, 10)).toBeGreaterThan(progressFromFuel(30, 10));
  });
});

describe("rankFromProgress monotonicity, determinism and clamping", () => {
  it("strictly decreases (better rank) as m rises", () => {
    let previous = Infinity;
    for (const m of [0, 10, 30, 50, 70, 90, 99]) {
      const rank = rankFromProgress(m);
      expect(rank).toBeLessThan(previous);
      previous = rank;
    }
  });

  it("is deterministic — same m always yields the same rank", () => {
    expect(rankFromProgress(42.5)).toBe(rankFromProgress(42.5));
    expect(rankFromProgress(0)).toBe(rankFromProgress(0));
  });

  it("never returns below 1", () => {
    expect(rankFromProgress(100)).toBeGreaterThanOrEqual(1);
    expect(rankFromProgress(1000)).toBeGreaterThanOrEqual(1);
  });

  it("returns R0 (the worst rank) at m=0", () => {
    expect(rankFromProgress(0)).toBe(100_000);
  });
});

describe("rankFromProgress diminishing marginal gain", () => {
  it("moves ranks much faster per unit m early on than late", () => {
    const earlyDelta = rankFromProgress(10) - rankFromProgress(11);
    const lateDelta = rankFromProgress(90) - rankFromProgress(91);
    expect(earlyDelta).toBeGreaterThan(0);
    expect(lateDelta).toBeGreaterThanOrEqual(0);
    expect(earlyDelta).toBeGreaterThan(lateDelta * 10);
  });
});

describe("progressFromRank inverse curve", () => {
  it("round-trips through rankFromProgress for interior values", () => {
    const m = 55;
    const rank = rankFromProgress(m);
    // The ceil in rankFromProgress means the inverse only approximately recovers m — assert
    // it lands within a small tolerance rather than exact equality.
    expect(progressFromRank(rank)).toBeGreaterThan(m - 1);
    expect(progressFromRank(rank)).toBeLessThanOrEqual(m + 1);
  });

  it("maps rank 1 to m=100 and rank R0 to m=0", () => {
    expect(progressFromRank(1)).toBeCloseTo(100, 5);
    expect(progressFromRank(100_000)).toBeCloseTo(0, 5);
  });
});

describe("neighborRanks", () => {
  it("keeps the user's rank strictly between the above and below neighbors", () => {
    const userRank = 1000;
    const { above, below } = neighborRanks(userRank);
    for (const rank of above) expect(rank).toBeLessThan(userRank);
    for (const rank of below) expect(rank).toBeGreaterThan(userRank);
  });

  it("returns 3 above and 2 below ranks, all distinct and >=1", () => {
    const { above, below } = neighborRanks(500);
    const all = [...above, ...below];
    expect(all).toHaveLength(5);
    expect(new Set(all).size).toBe(5);
    for (const rank of all) expect(rank).toBeGreaterThanOrEqual(1);
  });

  it("keeps above ascending (furthest first) and below ascending (closest first)", () => {
    const { above, below } = neighborRanks(2000);
    expect(above[0]).toBeLessThan(above[1]);
    expect(above[1]).toBeLessThan(above[2]);
    expect(below[0]).toBeLessThan(below[1]);
  });

  it("is deterministic for the same user rank", () => {
    expect(neighborRanks(777)).toEqual(neighborRanks(777));
  });

  it("degrades gracefully near the best possible rank without throwing", () => {
    const { above, below } = neighborRanks(1);
    for (const rank of above) expect(rank).toBeGreaterThanOrEqual(1);
    for (const rank of below) expect(rank).toBeGreaterThan(1);
  });
});

describe("goalDomainClosure", () => {
  it("includes the goal nodes themselves plus their requires-prerequisites", () => {
    const edges = [
      {
        id: "e1",
        source_id: "prereq",
        target_id: "goalNode",
        edge_type: "requires" as const,
        weight: 1,
        confidence: 1,
        origin: "user" as const,
        created_at: "t",
      },
    ];
    const closure = goalDomainClosure(edges, ["goalNode"]);
    expect(new Set(closure)).toEqual(new Set(["goalNode", "prereq"]));
  });

  it("grows when a new prerequisite edge lands in the same domain — the 'recomputed fresh' contract", () => {
    const before = goalDomainClosure([], ["goalNode"]);
    const after = goalDomainClosure(
      [
        {
          id: "e1",
          source_id: "newNode",
          target_id: "goalNode",
          edge_type: "requires" as const,
          weight: 1,
          confidence: 1,
          origin: "llm" as const,
          created_at: "t",
        },
      ],
      ["goalNode"],
    );
    expect(after.length).toBeGreaterThan(before.length);
  });
});
