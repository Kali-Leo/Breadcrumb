/**
 * Purpose: unit tests for the pure-incentive rank engine (spec 020, kept by spec 021) —
 * seeded start rank, the fuel curve's three properties (monotone, unreachable top,
 * diminishing steps), and the shown-rank rules (never worse while learning, bounded slip
 * after absence).
 */
import { describe, expect, it } from "vitest";
import {
  domainFuel,
  goalDomainClosure,
  RANK_FLOOR,
  RANK_SLIP_MAX_SHARE,
  RANK_START_MIN,
  RANK_START_RANGE,
  rankFromFuel,
  resolveShownRank,
  startRank,
} from "./rankEngine";

describe("domainFuel", () => {
  it("grows with more mastery over the closure set and is 0 when empty", () => {
    const low = domainFuel(
      ["a", "b"],
      new Map([
        ["a", 0.2],
        ["b", 0.1],
      ]),
    );
    const high = domainFuel(
      ["a", "b"],
      new Map([
        ["a", 0.9],
        ["b", 0.8],
      ]),
    );
    expect(high).toBeGreaterThan(low);
    expect(domainFuel([], new Map())).toBe(0);
  });
});

describe("startRank", () => {
  it("is deterministic per goal and varies across goals", () => {
    expect(startRank("goal-1")).toBe(startRank("goal-1"));
    const values = new Set(["g1", "g2", "g3", "g4", "g5"].map((id) => startRank(id)));
    expect(values.size).toBeGreaterThan(1);
  });

  it("stays inside the window and never lands on a round thousand", () => {
    for (const id of ["a", "b", "c", "d", "e", "f", "goal-42"]) {
      const value = startRank(id);
      expect(value).toBeGreaterThanOrEqual(RANK_START_MIN);
      expect(value).toBeLessThanOrEqual(RANK_START_MIN + RANK_START_RANGE + 7);
      expect(value % 1000).not.toBe(0);
    }
  });
});

describe("rankFromFuel", () => {
  const start = 137_483;

  it("strictly improves (smaller number) as fuel rises, from exactly the start at zero fuel", () => {
    expect(rankFromFuel(0, start)).toBe(start);
    let previous = Infinity;
    for (const fuel of [1, 3, 8, 20, 50, 120]) {
      const rank = rankFromFuel(fuel, start);
      expect(rank).toBeLessThan(previous);
      previous = rank;
    }
  });

  it("never reaches rank 1 — the top is unclaimable at any fuel", () => {
    for (const fuel of [0, 10, 100, 1_000, 100_000]) {
      expect(rankFromFuel(fuel, start)).toBeGreaterThanOrEqual(RANK_FLOOR);
    }
  });

  it("advances by smaller steps per unit of fuel the closer it is to the top (Leo's 越靠近1越慢)", () => {
    const earlyStep = rankFromFuel(0, start) - rankFromFuel(5, start);
    const lateStep = rankFromFuel(100, start) - rankFromFuel(105, start);
    expect(earlyStep).toBeGreaterThan(lateStep * 10);
  });

  it("is deterministic and never worse than the start rank", () => {
    expect(rankFromFuel(4.2, start)).toBe(rankFromFuel(4.2, start));
    expect(rankFromFuel(-3, start)).toBeLessThanOrEqual(start);
  });
});

describe("resolveShownRank", () => {
  const start = 137_483;

  it("shows the raw curve value on the first ever view", () => {
    expect(resolveShownRank(5, start, null)).toBe(rankFromFuel(5, start));
  });

  it("never worsens while the learner keeps learning (fuel did not drop)", () => {
    const before = resolveShownRank(5, start, null);
    const after = resolveShownRank(5.4, start, { lastShownRank: before, lastViewFuel: 5 });
    expect(after).toBeLessThanOrEqual(before);
    const idle = resolveShownRank(5, start, { lastShownRank: before, lastViewFuel: 5 });
    expect(idle).toBe(before);
  });

  it("slips back after a fuel drop, but by at most the bounded share per view", () => {
    const lastShownRank = rankFromFuel(20, start);
    const slipped = resolveShownRank(2, start, { lastShownRank, lastViewFuel: 20 });
    expect(slipped).toBeGreaterThan(lastShownRank);
    expect(slipped).toBeLessThanOrEqual(Math.round(lastShownRank * (1 + RANK_SLIP_MAX_SHARE)));
    expect(slipped).toBeLessThanOrEqual(start);
  });

  it("a tiny fuel drop slips by the curve's own amount when that is within the bound", () => {
    const lastShownRank = rankFromFuel(20, start);
    const slipped = resolveShownRank(19.8, start, { lastShownRank, lastViewFuel: 20 });
    expect(slipped).toBe(rankFromFuel(19.8, start));
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
