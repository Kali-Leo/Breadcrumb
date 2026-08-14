/**
 * Purpose: unit tests for mergeTextRuns — same-type clustering, plain-text gaps, and the
 * overlap backstop that drops a door span colliding with a diglot span.
 */
import type { ReplacementPatch } from "@breadcrumb/plugin-diglot-weave";
import type { DoorCandidate } from "@breadcrumb/plugin-explore";
import { describe, expect, it } from "vitest";
import { mergeTextRuns } from "./messagePatchMerge";

const diglotPatch = (start: number, end: number): ReplacementPatch => ({
  start,
  end,
  original: "x".repeat(end - start),
  replacement: "y",
  lemma: "x",
  kind: "word",
});

const doorPatch = (start: number, end: number, nodeId = "n1"): DoorCandidate => ({
  start,
  end,
  original: "x".repeat(end - start),
  nodeId,
});

describe("mergeTextRuns", () => {
  it("returns one plain run over the whole node when there are no patches", () => {
    expect(mergeTextRuns(0, 10, [], [])).toEqual([{ kind: "plain", start: 0, end: 10 }]);
  });

  it("interleaves a diglot run and a door run with plain gaps around both", () => {
    const runs = mergeTextRuns(0, 20, [diglotPatch(2, 5)], [doorPatch(10, 14)]);
    expect(runs).toEqual([
      { kind: "plain", start: 0, end: 2 },
      { kind: "diglot", start: 2, end: 5, patches: [diglotPatch(2, 5)] },
      { kind: "plain", start: 5, end: 10 },
      { kind: "door", start: 10, end: 14, patches: [doorPatch(10, 14)] },
      { kind: "plain", start: 14, end: 20 },
    ]);
  });

  it("groups adjacent same-type patches into one cluster", () => {
    const runs = mergeTextRuns(0, 10, [], [doorPatch(0, 2, "a"), doorPatch(2, 4, "b")]);
    expect(runs).toEqual([
      {
        kind: "door",
        start: 0,
        end: 4,
        patches: [doorPatch(0, 2, "a"), doorPatch(2, 4, "b")],
      },
      { kind: "plain", start: 4, end: 10 },
    ]);
  });

  it("drops a door span overlapping a diglot span (weave priority backstop)", () => {
    const runs = mergeTextRuns(0, 10, [diglotPatch(2, 6)], [doorPatch(4, 8)]);
    expect(runs).toEqual([
      { kind: "plain", start: 0, end: 2 },
      { kind: "diglot", start: 2, end: 6, patches: [diglotPatch(2, 6)] },
      { kind: "plain", start: 6, end: 10 },
    ]);
  });
});
