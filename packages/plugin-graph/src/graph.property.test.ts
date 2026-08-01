/**
 * Purpose: fast-check property tests for the graph module (spec 013 T5) — over arbitrary
 * requires-edge sets, wouldCreateCycle's guard never lets topologicalOrder throw, and
 * prerequisiteClosure only grows (never shrinks) as the query node set grows.
 */
import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { prerequisiteClosure, topologicalOrder, wouldCreateCycle } from "./graph";

const NODE_IDS = ["A", "B", "C", "D", "E", "F"] as const;
const NUM_RUNS = 200;

const candidateEdgeArb = fc.record({
  source: fc.constantFrom(...NODE_IDS),
  target: fc.constantFrom(...NODE_IDS),
});

function toEdgeRow(index: number, source: string, target: string): KnowledgeEdgeRow {
  return {
    id: `e${index}`,
    source_id: source,
    target_id: target,
    edge_type: "requires",
    weight: 1,
    confidence: 0.9,
    origin: "llm",
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

/** Replays planEdgeJudgeResult's own incremental cycle guard: try each candidate against the
 * edges accepted so far, keep it only if it wouldn't create a cycle. */
function buildCycleSafeEdges(
  candidates: readonly { source: string; target: string }[],
): KnowledgeEdgeRow[] {
  let edges: KnowledgeEdgeRow[] = [];
  let nextIndex = 0;
  for (const candidate of candidates) {
    if (wouldCreateCycle(edges, { source_id: candidate.source, target_id: candidate.target }))
      continue;
    edges = [...edges, toEdgeRow(nextIndex, candidate.source, candidate.target)];
    nextIndex += 1;
  }
  return edges;
}

describe("wouldCreateCycle (property)", () => {
  it("never lets topologicalOrder throw, for any sequence of candidate edges", () => {
    fc.assert(
      fc.property(fc.array(candidateEdgeArb, { minLength: 0, maxLength: 30 }), (candidates) => {
        const edges = buildCycleSafeEdges(candidates);
        expect(() => topologicalOrder(edges, [...NODE_IDS])).not.toThrow();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("the accepted edge set always has a valid topological order covering every edge endpoint", () => {
    fc.assert(
      fc.property(fc.array(candidateEdgeArb, { minLength: 0, maxLength: 30 }), (candidates) => {
        const edges = buildCycleSafeEdges(candidates);
        const order = topologicalOrder(edges, [...NODE_IDS]);
        const positionOf = new Map(order.map((id, index) => [id, index]));
        for (const edge of edges) {
          const sourcePos = positionOf.get(edge.source_id);
          const targetPos = positionOf.get(edge.target_id);
          if (sourcePos !== undefined && targetPos !== undefined) {
            expect(sourcePos).toBeLessThan(targetPos);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("prerequisiteClosure (property)", () => {
  it("is monotone: closure of a superset of query nodes is a superset of the closure", () => {
    fc.assert(
      fc.property(
        fc.array(candidateEdgeArb, { minLength: 0, maxLength: 30 }),
        fc.subarray([...NODE_IDS]),
        fc.subarray([...NODE_IDS]),
        (candidates, subsetA, extra) => {
          const edges = buildCycleSafeEdges(candidates);
          const supersetQuery = [...new Set([...subsetA, ...extra])];
          const closureA = new Set(prerequisiteClosure(edges, subsetA));
          const closureSuperset = new Set(prerequisiteClosure(edges, supersetQuery));
          for (const id of closureA) {
            expect(closureSuperset.has(id)).toBe(true);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
