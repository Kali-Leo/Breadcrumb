/**
 * Purpose: spec 059 assertion tests — the browsing component must be able to flip the
 * frontier order (the 2026-08-28 audit's lesson: a component that can never decide the
 * order is decoration), must stay silent when absent, and must surface its source title.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { frontier } from "./frontier";

function node(id: string, label: string): KnowledgeNodeRow {
  return {
    id,
    parent_id: null,
    label,
    summary: "",
    kind: "concept",
    created_at: "2026-08-01T00:00:00Z",
  };
}

/** Two prerequisite-free candidates that tie on every other component. */
const nodes = [node("a", "Alpha"), node("b", "Beta")];
const base = {
  nodes,
  edges: [],
  masteryByNode: new Map<string, number>(),
  interestByNode: new Map<string, number>(),
  litThreshold: 0.85,
  previouslyLitNodeIds: new Set<string>(),
};

describe("frontier browsing component (spec 059)", () => {
  it("flips the ranking of two otherwise-tied candidates", () => {
    const without = frontier(base);
    expect(without.map((candidate) => candidate.nodeId)).toEqual(["a", "b"]);

    const withBrowsing = frontier({
      ...base,
      browsingAffinityByNode: new Map([["b", 0.4]]),
    });
    expect(withBrowsing.map((candidate) => candidate.nodeId)).toEqual(["b", "a"]);
  });

  it("an empty affinity map changes nothing — order and reasons match the omitted case", () => {
    const omitted = frontier(base);
    const empty = frontier({ ...base, browsingAffinityByNode: new Map() });
    expect(empty).toEqual(omitted);
  });

  it("shared identical affinity carries no information and cannot move the order", () => {
    const result = frontier({
      ...base,
      browsingAffinityByNode: new Map([
        ["a", 0.4],
        ["b", 0.4],
      ]),
    });
    expect(result).toEqual(frontier(base));
  });

  it("never names any watched title anywhere in the result (Leo 裁决 2026-08-30)", () => {
    const result = frontier({
      ...base,
      browsingAffinityByNode: new Map([["b", 0.9]]),
    });
    expect(JSON.stringify(result)).not.toContain("browsingSource");
    expect(JSON.stringify(result)).not.toContain("title");
  });

  it("cannot outvote conversational interest at equal normalized strength", () => {
    // a carries the strongest conversational interest, b the strongest browsing affinity.
    // Both normalize to 1 on their own component; interest weighs double browsing.
    const result = frontier({
      ...base,
      interestByNode: new Map([["a", 0.6]]),
      browsingAffinityByNode: new Map([["b", 0.9]]),
    });
    expect(result.map((candidate) => candidate.nodeId)).toEqual(["a", "b"]);
  });
});
