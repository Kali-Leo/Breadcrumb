/**
 * Purpose: tests for the cliff-cut visible frontier (spec 060 §1) — cut lands on the largest
 * score drop inside [3, 6], flat lists fill to the cap, short lists pass through — and for the
 * exploration slot that reorders what survived the cut.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { frontier } from "./frontier";
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

const withEvidence = (entries: [number, number][]) =>
  entries.map(([score, evidenceWeight]) => ({ score, evidenceWeight }));

/** Scores whose cliff falls after the 4th, so four candidates are shown and the slot has
 * somewhere to reach: a slot that can only ever look at the 3rd of three shown is a no-op. */
const SHOWS_FOUR: [number, number][] = [
  [1, 5],
  [0.9, 4],
  [0.8, 3],
  [0.75, 2],
  [0.1, 1],
];

const reweighted = (evidence: number[]): [number, number][] =>
  SHOWS_FOUR.map(([score], index) => [score, evidence[index] ?? 0]);

describe("the exploration slot inside the visible set", () => {
  it("promotes the thinnest-evidence candidate into the third shown position", () => {
    const shown = visibleFrontier(withEvidence(reweighted([5, 4, 3, 0.2, 9])));
    expect(shown.map((candidate) => candidate.score)).toEqual([1, 0.9, 0.75, 0.8]);
  });

  it("leaves the order alone when the natural third place is already thinnest", () => {
    const shown = visibleFrontier(withEvidence(reweighted([5, 4, 0.2, 3, 9])));
    expect(shown.map((candidate) => candidate.score)).toEqual([1, 0.9, 0.8, 0.75]);
  });

  it("is a no-op when no candidate carries an evidence weight", () => {
    const shown = visibleFrontier(scored(1, 0.9, 0.8, 0.75, 0.1));
    expect(shown.map((candidate) => candidate.score)).toEqual([1, 0.9, 0.8, 0.75]);
  });

  it("never adds or drops a candidate — it only reorders", () => {
    const candidates = withEvidence(reweighted([5, 4, 3, 0.2, 9]));
    const shown = visibleFrontier(candidates);
    expect(shown).toHaveLength(4);
    expect([...shown].sort((a, b) => b.score - a.score)).toEqual(candidates.slice(0, 4));
  });

  it("leaves a method candidate in its own bucket rather than promoting it", () => {
    const shown = visibleFrontier([
      { score: 1, kind: "concept", evidenceWeight: 5 },
      { score: 0.9, kind: "concept", evidenceWeight: 4 },
      { score: 0.8, kind: "concept", evidenceWeight: 3 },
      { score: 0.75, kind: "method", evidenceWeight: 0.1 },
      { score: 0.1, kind: "concept", evidenceWeight: 9 },
    ]);
    expect(shown.map((candidate) => candidate.kind)).toEqual([
      "concept",
      "concept",
      "concept",
      "method",
    ]);
  });
});

/**
 * Regression (bug hunt 2026-09-03, P1-1), end to end through the real frontier(): five
 * candidates whose scores fall off a cliff after the 4th, with the 5th also carrying the
 * thinnest evidence. The exploration slot used to be spliced into position 2 before the cliff
 * search ran; the drop at cut = 3 then came out negative, the real cliff was hidden, and the
 * search cut at the 4th — dropping the genuine 4th place and keeping a 0-scoring candidate.
 */
describe("the score cliff is measured before the exploration slot moves anything", () => {
  const node = (id: string): KnowledgeNodeRow => ({
    id,
    parent_id: null,
    label: id,
    summary: "",
    kind: "concept",
    created_at: "2026-08-01T00:00:00Z",
  });
  const edges: KnowledgeEdgeRow[] = [];

  const nodes = ["c0", "c1", "c2", "c3", "c4"].map(node);
  // Interest is the only live component, so the score order is the interest order.
  const interestByNode = new Map([
    ["c0", 1],
    ["c1", 0.94],
    ["c2", 0.88],
    ["c3", 0.83],
    ["c4", 0],
  ]);
  // c4 is the thinnest-evidence candidate: the one the slot wants to promote.
  const evidenceWeightByNode = new Map([
    ["c0", 5],
    ["c1", 4],
    ["c2", 3],
    ["c3", 2],
    ["c4", 0.1],
  ]);

  const ranked = frontier({
    nodes,
    edges,
    masteryByNode: new Map(),
    interestByNode,
    litThreshold: 0.85,
    previouslyLitNodeIds: new Set(),
    evidenceWeightByNode,
  });

  it("keeps the genuine 4th place and does not show the 0-scoring candidate", () => {
    const shown = visibleFrontier(ranked).map((candidate) => candidate.nodeId);
    expect(shown).toContain("c3");
    expect(shown).not.toContain("c4");
  });

  it("cuts at the same place it would with the exploration slot switched off", () => {
    const withoutSlot = frontier({
      nodes,
      edges,
      masteryByNode: new Map(),
      interestByNode,
      litThreshold: 0.85,
      previouslyLitNodeIds: new Set(),
    });
    expect(visibleFrontier(ranked)).toHaveLength(visibleFrontier(withoutSlot).length);
  });
});
