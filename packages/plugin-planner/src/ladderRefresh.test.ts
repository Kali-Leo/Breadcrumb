/**
 * Purpose: unit tests for planLadderRefresh's four decision paths (fresh / reuse /
 * promote-regenerate / demote-reuse-slide, plus the symmetric demote-regenerate edge) and for
 * assembleLadderSlots's six-row ordering.
 */
import { describe, expect, it } from "vitest";
import { assembleLadderSlots, planLadderRefresh, type StoredLadder } from "./ladderRefresh";
import { neighborRanks } from "./rankEngine";

function ladder(userRankAtGeneration: number): StoredLadder {
  return { userRankAtGeneration };
}

describe("planLadderRefresh", () => {
  it("path: fresh — generates when there is no stored ladder", () => {
    expect(planLadderRefresh(null, 1000)).toBe("generate");
  });

  it("path: reuse — an unchanged or barely-moved rank stays within the anchored band", () => {
    const stored = ladder(1000);
    const { above, below } = neighborRanks(1000);
    expect(planLadderRefresh(stored, 1000)).toBe("reuse");
    // Right at the 2nd-neighbor boundaries (inclusive) still counts as reuse.
    expect(planLadderRefresh(stored, above[1])).toBe("reuse");
    expect(planLadderRefresh(stored, below[1])).toBe("reuse");
  });

  it("path: promote-regenerate — improving past the 2nd above-neighbor regenerates", () => {
    const stored = ladder(1000);
    const { above } = neighborRanks(1000);
    expect(planLadderRefresh(stored, (above[1] as number) - 1)).toBe("generate");
    expect(planLadderRefresh(stored, 1)).toBe("generate");
  });

  it("path: demote-reuse-slide — worsening a bit still reuses, sliding the user's row down", () => {
    const stored = ladder(1000);
    const { below } = neighborRanks(1000);
    const slightlyWorse = 1000 + Math.floor(((below[1] as number) - 1000) / 2);
    expect(planLadderRefresh(stored, slightlyWorse)).toBe("reuse");
  });

  it("symmetric edge: demote-regenerate — falling past the 2nd below-neighbor regenerates", () => {
    const stored = ladder(1000);
    const { below } = neighborRanks(1000);
    expect(planLadderRefresh(stored, (below[1] as number) + 1)).toBe("generate");
  });

  it("is a pure function of its inputs (no hidden state across calls)", () => {
    const stored = ladder(1000);
    expect(planLadderRefresh(stored, 1000)).toBe(planLadderRefresh(stored, 1000));
  });
});

describe("assembleLadderSlots", () => {
  it("sorts 3 above + user + 2 below ascending by rank, user always at index 3", () => {
    const slots = assembleLadderSlots([550, 720, 900], 1000, [1150, 1400]);
    expect(slots.map((slot) => slot.rank)).toEqual([550, 720, 900, 1000, 1150, 1400]);
    expect(slots.findIndex((slot) => slot.isUser)).toBe(3);
  });

  it("keeps the user at index 3 regardless of how compressed the ranks are", () => {
    const slots = assembleLadderSlots([1, 2, 3], 4, [5, 6]);
    expect(slots.findIndex((slot) => slot.isUser)).toBe(3);
    expect(slots).toHaveLength(6);
  });
});
