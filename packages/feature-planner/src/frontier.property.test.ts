/**
 * Purpose: fast-check property tests — over arbitrary mastery/interest vectors and cycle-safe
 * edge sets, frontier() surfaces exactly the not-currently-lit nodes and tells the truth about
 * each one's prerequisites, and gapAndPath()'s three routes are always exact permutations of
 * its own gap set (no node invented, none dropped, none duplicated).
 *
 * The property this file used to assert — "never surfaces a candidate with an unsatisfied
 * requires-prerequisite" — is gone with the hard gate it described. Those edges are LLM-drawn
 * and a measurable share come back with the direction reversed, so the gate turned each
 * reversal into a permanently invisible concept. The replacement properties are about honesty
 * and coverage: nothing is silently withheld, and every caveat on a candidate is real.
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
  it("surfaces exactly the unlit nodes, each one honest about its prerequisites", () => {
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

          // Coverage: no unlit node is ever withheld, and no node is listed twice. This is
          // the property that replaces the gate — a structural edge may reorder the list, it
          // may never remove something from it.
          expect([...candidatesOut.map((candidate) => candidate.nodeId)].sort()).toEqual(
            NODE_IDS.filter((id) => !isLit(id)).sort(),
          );

          // "Satisfied" reads "was ever lit", not "lit right now": mastery is a retention
          // estimate that expires in days, so reading structure off it alone would put a
          // phantom caveat on every deep node a week after it was learned.
          const wasEverLit = (id: string) => isLit(id) || previouslyLitNodeIds.has(id);
          for (const candidate of candidatesOut) {
            const prereqIds = incomingNeighbors(edges, candidate.nodeId, "requires");
            expect([...candidate.reason.litPrerequisiteLabels].sort()).toEqual(
              prereqIds.filter(wasEverLit).sort(),
            );
            expect([...candidate.reason.unlitPrerequisiteLabels].sort()).toEqual(
              prereqIds.filter((id) => !wasEverLit(id)).sort(),
            );
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
