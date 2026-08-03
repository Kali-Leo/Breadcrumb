/**
 * Purpose: unit tests for planLadderRefresh — the four acceptance-criteria paths (generate
 * first time / reuse on small change / regenerate on ≥3 progress / reuse on regression) plus
 * the downward-regeneration edge case, using plain fixture objects standing in for what a
 * real LLM-backed generation would have stored (no network, no DB).
 */
import { describe, expect, it } from "vitest";
import { LADDER_REGENERATE_DELTA, planLadderRefresh, type StoredLadder } from "./ladderRefresh";

function ladder(userMilestoneAtGeneration: number, milestones: number[]): StoredLadder {
  return {
    userMilestoneAtGeneration,
    figures: milestones.map((milestone) => ({ figureDesc: `figure-${milestone}`, milestone })),
  };
}

describe("planLadderRefresh", () => {
  it("path 1: generates when there is no stored ladder", () => {
    expect(planLadderRefresh(null, 40)).toBe("generate");
  });

  it("path 2: reuses when the milestone change is within the regenerate delta", () => {
    const stored = ladder(40, [50, 45, 40, 35, 30]);
    expect(planLadderRefresh(stored, 40)).toBe("reuse");
    expect(planLadderRefresh(stored, 41)).toBe("reuse");
    expect(planLadderRefresh(stored, 39)).toBe("reuse");
    expect(planLadderRefresh(stored, 40 + LADDER_REGENERATE_DELTA - 1)).toBe("reuse");
  });

  it("path 3: regenerates once progress reaches the regenerate delta", () => {
    const stored = ladder(40, [50, 45, 40, 35, 30]);
    expect(planLadderRefresh(stored, 40 + LADDER_REGENERATE_DELTA)).toBe("generate");
    expect(planLadderRefresh(stored, 90)).toBe("generate");
  });

  it("path 4: reuses (falls back) on a regression that hasn't fallen out from under the ladder", () => {
    const stored = ladder(40, [50, 45, 40, 35, 30]);
    // Regressed from 40 to 32 — below atGeneration but still above min(recorded) - delta (27).
    expect(planLadderRefresh(stored, 32)).toBe("reuse");
  });

  it("path 5: regenerates downward once the regression falls below the lowest figure - delta", () => {
    const stored = ladder(40, [50, 45, 40, 35, 30]);
    // min recorded is 30, delta is 3: exactly 27 is still within bounds (not "<"), 26 tips over.
    expect(planLadderRefresh(stored, 30 - LADDER_REGENERATE_DELTA)).toBe("reuse");
    expect(planLadderRefresh(stored, 30 - LADDER_REGENERATE_DELTA - 1)).toBe("generate");
  });

  it("is a pure function of its inputs (no hidden state across calls)", () => {
    const stored = ladder(40, [50, 45, 40, 35, 30]);
    const first = planLadderRefresh(stored, 40);
    const second = planLadderRefresh(stored, 40);
    expect(first).toBe(second);
  });
});
