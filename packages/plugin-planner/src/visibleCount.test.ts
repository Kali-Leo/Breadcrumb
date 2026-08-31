/**
 * Purpose: tests for the cliff-cut visible frontier (spec 060 §1) — cut lands on the largest
 * score drop inside [3, 6], flat lists fill to the cap, short lists pass through.
 */
import { describe, expect, it } from "vitest";
import { FRONTIER_VISIBLE_MAX, FRONTIER_VISIBLE_MIN, visibleFrontier } from "./visibleCount";

const scored = (...scores: number[]) => scores.map((score) => ({ score }));

describe("visibleFrontier", () => {
  it("cuts at the largest cliff between positions 3 and 6", () => {
    // Big drop after the 4th: 3–6 window picks cut=4.
    const cut = visibleFrontier(scored(3, 2.9, 2.8, 2.7, 0.5, 0.4, 0.3, 0.2));
    expect(cut).toHaveLength(4);
  });

  it("shows the minimum when the cliff sits right after it", () => {
    const cut = visibleFrontier(scored(3, 2.9, 2.8, 0.5, 0.4, 0.3, 0.2));
    expect(cut).toHaveLength(FRONTIER_VISIBLE_MIN);
  });

  it("fills to the cap when scores are flat — equally good candidates all show", () => {
    const cut = visibleFrontier(scored(1, 1, 1, 1, 1, 1, 1, 1));
    expect(cut).toHaveLength(FRONTIER_VISIBLE_MAX);
  });

  it("never exceeds the cap however steep the tail", () => {
    const cut = visibleFrontier(scored(9, 8, 7, 6, 5, 4, 3, 2, 1));
    expect(cut.length).toBeLessThanOrEqual(FRONTIER_VISIBLE_MAX);
  });

  it("passes short lists through untouched", () => {
    expect(visibleFrontier(scored(2, 1))).toHaveLength(2);
    expect(visibleFrontier(scored(2, 1, 0.5))).toHaveLength(3);
    expect(visibleFrontier([])).toEqual([]);
  });
});
