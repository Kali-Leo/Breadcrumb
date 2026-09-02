/**
 * Purpose: unit tests for planGoalRequiresEdges — label resolution scoped to the mapping's own
 * set, the cycle guard, and the edge row shape. Pure input/output, no DB.
 */
import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";
import type { SuggestedGoalNode } from "@breadcrumb/feature-planner";
import { describe, expect, it } from "vitest";
import { planGoalRequiresEdges } from "./goalRequiresEdges";

let idCounter = 0;
const base = {
  idByLabel: new Map([
    ["导数", "n-derivative"],
    ["多元函数微分", "n-multivar"],
    ["重积分", "n-multi-integral"],
  ]),
  confidence: 0.6,
  newId: () => {
    idCounter += 1;
    return `edge-${idCounter}`;
  },
  nowIso: () => "2026-08-28T00:00:00.000Z",
};

function suggested(label: string, requires?: string[]): SuggestedGoalNode {
  return { label, summary: "s", ...(requires === undefined ? {} : { requires }) };
}

describe("planGoalRequiresEdges", () => {
  it("plans a requires edge pointing from the prerequisite to the node that needs it", () => {
    const { edges } = planGoalRequiresEdges({
      ...base,
      suggested: [suggested("多元函数微分", ["导数"])],
      existingEdges: [],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source_id: "n-derivative",
      target_id: "n-multivar",
      edge_type: "requires",
      weight: 1,
      confidence: 0.6,
      origin: "llm",
    });
  });

  it("plans nothing for a node that declared no prerequisites", () => {
    const { edges, unknownLabels, rejectedCyclic } = planGoalRequiresEdges({
      ...base,
      suggested: [suggested("重积分")],
      existingEdges: [],
    });
    expect(edges).toEqual([]);
    expect(unknownLabels).toEqual([]);
    expect(rejectedCyclic).toEqual([]);
  });

  it("reports a label outside this mapping's own set instead of inventing a node for it", () => {
    const { edges, unknownLabels } = planGoalRequiresEdges({
      ...base,
      suggested: [suggested("重积分", ["量子色动力学"])],
      existingEdges: [],
    });
    expect(edges).toEqual([]);
    expect(unknownLabels).toEqual(["量子色动力学"]);
  });

  it("refuses an edge that would close a cycle against edges already in the store", () => {
    const existing: KnowledgeEdgeRow = {
      id: "e-existing",
      source_id: "n-multivar",
      target_id: "n-derivative",
      edge_type: "requires",
      weight: 1,
      confidence: 0.9,
      origin: "llm",
      created_at: "2026-08-01T00:00:00Z",
    };
    const { edges, rejectedCyclic } = planGoalRequiresEdges({
      ...base,
      suggested: [suggested("多元函数微分", ["导数"])],
      existingEdges: [existing],
    });
    expect(edges).toEqual([]);
    expect(rejectedCyclic).toEqual([{ source_id: "n-derivative", target_id: "n-multivar" }]);
  });

  it("refuses a cycle formed by the mapping's own edges within one call", () => {
    const { edges, rejectedCyclic } = planGoalRequiresEdges({
      ...base,
      suggested: [suggested("多元函数微分", ["重积分"]), suggested("重积分", ["多元函数微分"])],
      existingEdges: [],
    });
    expect(edges).toHaveLength(1);
    expect(rejectedCyclic).toHaveLength(1);
  });

  it("refuses a self-requirement", () => {
    const { edges, rejectedCyclic } = planGoalRequiresEdges({
      ...base,
      suggested: [suggested("重积分", ["重积分"])],
      existingEdges: [],
    });
    expect(edges).toEqual([]);
    expect(rejectedCyclic).toHaveLength(1);
  });
});
