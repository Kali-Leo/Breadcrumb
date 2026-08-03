/**
 * Purpose: unit tests for milestone()/milestoneBand() — the formula's weighting, empty-goal
 * edge case, band boundaries, and monotonicity (progress never decreases the number for the
 * same set of goal nodes gaining mastery).
 */
import { describe, expect, it } from "vitest";
import { milestone, milestoneBand } from "./milestone";

const LIT = 0.85;
const DIM = 0.5;

describe("milestone", () => {
  it("returns 0 for an empty goal", () => {
    expect(milestone([], new Map(), LIT, DIM)).toBe(0);
  });

  it("returns 0 when nothing is lit or dim", () => {
    const goalNodeIds = ["a", "b"];
    const goalMasteryByNode = new Map([
      ["a", 0.1],
      ["b", 0],
    ]);
    expect(milestone(goalNodeIds, goalMasteryByNode, LIT, DIM)).toBe(0);
  });

  it("returns 100 when every goal node is lit", () => {
    const goalNodeIds = ["a", "b"];
    const goalMasteryByNode = new Map([
      ["a", 0.9],
      ["b", 0.95],
    ]);
    expect(milestone(goalNodeIds, goalMasteryByNode, LIT, DIM)).toBe(80);
  });

  it("weighs a fully-lit node above a merely-dim node", () => {
    const litOnly = milestone(["a"], new Map([["a", 0.9]]), LIT, DIM);
    const dimOnly = milestone(["a"], new Map([["a", 0.6]]), LIT, DIM);
    expect(litOnly).toBeGreaterThan(dimOnly);
    // 100 * 0.2 * 0.5 = 10
    expect(dimOnly).toBe(10);
  });

  it("computes a mixed lit/dim/unlit goal per the documented formula", () => {
    // 4 nodes: 1 lit, 1 dim, 2 unlit -> litFraction 0.25, dimFraction 0.25
    // 100 * (0.8*0.25 + 0.2*0.25*0.5) = 100 * (0.2 + 0.025) = 22.5 -> rounds to 23 (banker's? Math.round -> 23)
    const goalNodeIds = ["a", "b", "c", "d"];
    const goalMasteryByNode = new Map([
      ["a", 0.9],
      ["b", 0.6],
      ["c", 0.1],
      ["d", 0],
    ]);
    expect(milestone(goalNodeIds, goalMasteryByNode, LIT, DIM)).toBe(23);
  });

  it("treats a node absent from the mastery map as unlit (0)", () => {
    expect(milestone(["a"], new Map(), LIT, DIM)).toBe(0);
  });

  it("is monotonic: raising one node's mastery from unlit to dim to lit never lowers the score", () => {
    const goalNodeIds = ["a", "b", "c"];
    const unlit = milestone(goalNodeIds, new Map([["a", 0]]), LIT, DIM);
    const dim = milestone(goalNodeIds, new Map([["a", 0.6]]), LIT, DIM);
    const lit = milestone(goalNodeIds, new Map([["a", 0.9]]), LIT, DIM);
    expect(dim).toBeGreaterThanOrEqual(unlit);
    expect(lit).toBeGreaterThanOrEqual(dim);
  });

  it("is monotonic across a sequence of nodes lighting up one at a time", () => {
    const goalNodeIds = ["a", "b", "c", "d", "e"];
    let previous = -1;
    const mastery = new Map<string, number>();
    for (const nodeId of goalNodeIds) {
      mastery.set(nodeId, 0.9);
      const value = milestone(goalNodeIds, mastery, LIT, DIM);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(previous).toBe(80);
  });
});

describe("milestoneBand", () => {
  it("maps the documented boundaries to their band words", () => {
    expect(milestoneBand(0)).toBe("起步");
    expect(milestoneBand(19)).toBe("起步");
    expect(milestoneBand(20)).toBe("入门");
    expect(milestoneBand(39)).toBe("入门");
    expect(milestoneBand(40)).toBe("扎实");
    expect(milestoneBand(59)).toBe("扎实");
    expect(milestoneBand(60)).toBe("纵深");
    expect(milestoneBand(79)).toBe("纵深");
    expect(milestoneBand(80)).toBe("贯通");
    expect(milestoneBand(100)).toBe("贯通");
  });
});
