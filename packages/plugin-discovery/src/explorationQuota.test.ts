/**
 * Purpose: unit tests for interleaveExploration — the share is honoured and spread evenly, the
 * dial actually changes the mix, and neither list going empty costs the reader a full page.
 */
import { describe, expect, it } from "vitest";
import { defaultExplorationShare, interleaveExploration } from "./explorationQuota";

const familiar = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"];
const unfamiliar = ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"];

function countUnfamiliar(list: readonly string[]): number {
  return list.filter((item) => item.startsWith("n")).length;
}

describe("interleaveExploration", () => {
  it("gives a quarter of the positions to exploration by default, evenly spread", () => {
    const merged = interleaveExploration(familiar, unfamiliar, defaultExplorationShare);
    const firstEight = merged.slice(0, 8);
    expect(countUnfamiliar(firstEight)).toBe(2);
    // Evenly spread, not clumped: the two exploration cards sit a quarter-page apart.
    expect(firstEight.indexOf("n2") - firstEight.indexOf("n1")).toBe(4);
  });

  it("keeps every item — interleaving reorders the feed, it never drops from it", () => {
    const merged = interleaveExploration(familiar, unfamiliar, 0.25);
    expect(merged).toHaveLength(familiar.length + unfamiliar.length);
    expect(new Set(merged).size).toBe(merged.length);
  });

  it("changes the mix when the dial moves toward new territory", () => {
    const familiarLeaning = interleaveExploration(familiar, unfamiliar, 0.1).slice(0, 8);
    const newLeaning = interleaveExploration(familiar, unfamiliar, 0.5).slice(0, 8);
    expect(countUnfamiliar(familiarLeaning)).toBeLessThan(countUnfamiliar(newLeaning));
    expect(countUnfamiliar(newLeaning)).toBe(4);
  });

  it("fills the page from whichever list still has items", () => {
    expect(interleaveExploration([], unfamiliar.slice(0, 3), 0.25)).toEqual(["n1", "n2", "n3"]);
    expect(interleaveExploration(familiar.slice(0, 3), [], 0.25)).toEqual(["f1", "f2", "f3"]);
  });

  it("starts with a familiar card at the default share, not with an unfamiliar one", () => {
    const merged = interleaveExploration(familiar, unfamiliar, defaultExplorationShare);
    expect(merged[0]).toBe("f1");
  });

  it("treats a nonsense share as the default rather than emptying the page", () => {
    const merged = interleaveExploration(familiar, unfamiliar, Number.NaN);
    expect(merged).toHaveLength(familiar.length + unfamiliar.length);
    expect(countUnfamiliar(merged.slice(0, 8))).toBe(2);
  });
});
