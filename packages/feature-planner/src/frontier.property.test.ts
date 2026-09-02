/**
 * Purpose: fast-check property tests (spec 013 T5) — over arbitrary mastery/interest vectors
 * and cycle-safe edge sets, frontier() never surfaces a candidate with an unsatisfied requires-
 * prerequisite (the hard gate: lit now, or lit at some point before), and gapAndPath()'s three
 * routes are always exact permutations of its own gap set (no node invented, none dropped,
 * none duplicated).
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { incomingNeighbors, wouldCreateCycle } from "@breadcrumb/feature-graph";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { frontier } from "./frontier";
import { gapAndPath } from "./gapAndPath";

const NODE_IDS = ["A", "B", "C", "D", "E", "F"] as const;
const LIT_THRESHOLD = 0.85;
const NUM_RUNS = 200;

function node(id: string): KnowledgeNodeRow {
  return {
    id,
    parent_id: null,
    label: id,
    summary: "s",
    kind: "concept",
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

const candidateEdgeArb = fc.record({
  source: fc.constantFrom(...NODE_IDS),
  target: fc.constantFrom(...NODE_IDS),
  type: fc.constantFrom<"requires" | "helps">("requires", "helps"),
});

function buildEdges(
  candidates: readonly { source: string; target: string; type: "requires" | "helps" }[],
): KnowledgeEdgeRow[] {
  let edges: KnowledgeEdgeRow[] = [];
  let index = 0;
  for (const candidate of candidates) {
    if (
      candidate.type === "requires" &&
      wouldCreateCycle(edges, { source_id: candidate.source, target_id: candidate.target })
    ) {
      continue;
    }
    edges = [
      ...edges,
      {
        id: `e${index}`,
        source_id: candidate.source,
        target_id: candidate.target,
        edge_type: candidate.type,
        weight: candidate.type === "requires" ? 1 : 0.5,
        confidence: 0.9,
        origin: "llm",
        created_at: "2026-08-01T00:00:00.000Z",
      },
    ];
    index += 1;
  }
  return edges;
}

const masteryVectorArb = fc.array(fc.float({ min: 0, max: 1, noNaN: true }), {
  minLength: NODE_IDS.length,
  maxLength: NODE_IDS.length,
});

function toMasteryMap(vector: readonly number[]): Map<string, number> {
  return new Map(NODE_IDS.map((id, index) => [id, vector[index] ?? 0]));
}

describe("frontier (property)", () => {
  it("never surfaces a candidate with a never-satisfied requires-prerequisite", () => {
    fc.assert(
      fc.property(
        fc.array(candidateEdgeArb, { minLength: 0, maxLength: 25 }),
        masteryVectorArb,
        masteryVectorArb,
        fc.subarray<string>([...NODE_IDS]),
        (candidates, masteryVector, interestVector, previouslyLit) => {
          const edges = buildEdges(candidates);
          const nodes = NODE_IDS.map((id) => node(id));
          const masteryByNode = toMasteryMap(masteryVector);
          const interestByNode = toMasteryMap(interestVector);
          const isLit = (id: string) => (masteryByNode.get(id) ?? 0) >= LIT_THRESHOLD;
          const previouslyLitNodeIds = new Set(previouslyLit);

          const candidatesOut = frontier({
            nodes,
            edges,
            masteryByNode,
            interestByNode,
            litThreshold: LIT_THRESHOLD,
            previouslyLitNodeIds,
          });
          // The gate reads "was ever lit", not "is lit now" (2026-08-28 audit, planning gap
          // 4): mastery is a retention estimate that expires in days, so gating structure on
          // it locks deep nodes out permanently. Unbypassability is unchanged — a prerequisite
          // with no mastery and no history still blocks its dependent, absolutely.
          const wasEverLit = (id: string) => isLit(id) || previouslyLitNodeIds.has(id);
          for (const candidate of candidatesOut) {
            const prereqIds = incomingNeighbors(edges, candidate.nodeId, "requires");
            expect(prereqIds.every(wasEverLit)).toBe(true);
            expect(candidate.reason.wasLitBefore).toBe(previouslyLitNodeIds.has(candidate.nodeId));
            // The candidate's own exclusion stays on CURRENT mastery, so a decayed node can
            // still come back as a reunion candidate.
            expect(isLit(candidate.nodeId)).toBe(false);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("gapAndPath routes (property)", () => {
  it("shortest/steadiest/interestFirst are always exact permutations of the gap set", () => {
    fc.assert(
      fc.property(
        fc.array(candidateEdgeArb, { minLength: 0, maxLength: 25 }),
        masteryVectorArb,
        masteryVectorArb,
        fc.subarray([...NODE_IDS], { minLength: 1 }),
        (candidates, masteryVector, interestVector, goalNodeIds) => {
          const edges = buildEdges(candidates);
          const nodes = NODE_IDS.map((id) => node(id));
          const masteryByNode = toMasteryMap(masteryVector);
          const interestByNode = toMasteryMap(interestVector);

          const { gapNodeIds, routes } = gapAndPath({
            nodes,
            edges,
            masteryByNode,
            interestByNode,
            goalNodeIds,
            litThreshold: LIT_THRESHOLD,
          });
          const gapSorted = [...gapNodeIds].sort();
          for (const route of [routes.shortest, routes.steadiest, routes.interestFirst]) {
            expect([...route].sort()).toEqual(gapSorted);
            expect(new Set(route).size).toBe(route.length); // no duplicates
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
