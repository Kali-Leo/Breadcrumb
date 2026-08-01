/**
 * Purpose: unit tests for planEdgeJudgeResult — pair resolution, requires-edge cycle
 * rejection, helps weight defaulting, and method-node label resolution.
 */
import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import type { EdgeJudgeResult } from "./edgeJudge";
import { type JudgedPairContext, planEdgeJudgeResult } from "./plan";

let idCounter = 0;
const testDefaults = {
  newId: () => `id-${++idCounter}`,
  nowIso: () => "2026-08-01T12:00:00Z",
};

function emptyJudged(): EdgeJudgeResult {
  return { edges: [], methodNodes: [] };
}

describe("planEdgeJudgeResult requires edges", () => {
  it("plans a requires edge from A to B for direction aToB", () => {
    const pairs: JudgedPairContext[] = [{ pairId: "p0", nodeAId: "limits", nodeBId: "derivative" }];
    const judged: EdgeJudgeResult = {
      edges: [
        {
          pairId: "p0",
          relation: "requires",
          direction: "aToB",
          weight: null,
          confidence: 0.9,
          reasoning: "x",
        },
      ],
      methodNodes: [],
    };
    const plan = planEdgeJudgeResult({
      judged,
      pairs,
      existingEdges: [],
      nodeIdByLabel: new Map(),
      ...testDefaults,
    });
    expect(plan.edgesToUpsert).toHaveLength(1);
    expect(plan.edgesToUpsert[0]).toMatchObject({
      source_id: "limits",
      target_id: "derivative",
      edge_type: "requires",
      weight: 1,
    });
  });

  it("reverses direction for bToA", () => {
    const pairs: JudgedPairContext[] = [{ pairId: "p0", nodeAId: "derivative", nodeBId: "limits" }];
    const judged: EdgeJudgeResult = {
      edges: [
        {
          pairId: "p0",
          relation: "requires",
          direction: "bToA",
          weight: null,
          confidence: 0.9,
          reasoning: "x",
        },
      ],
      methodNodes: [],
    };
    const plan = planEdgeJudgeResult({
      judged,
      pairs,
      existingEdges: [],
      nodeIdByLabel: new Map(),
      ...testDefaults,
    });
    expect(plan.edgesToUpsert[0]).toMatchObject({ source_id: "limits", target_id: "derivative" });
  });

  it("drops a requires edge that would create a cycle and reports it", () => {
    const existingEdges: KnowledgeEdgeRow[] = [
      {
        id: "e0",
        source_id: "A",
        target_id: "B",
        edge_type: "requires",
        weight: 1,
        confidence: 0.9,
        origin: "llm",
        created_at: "2026-08-01T10:00:00Z",
      },
    ];
    const pairs: JudgedPairContext[] = [{ pairId: "p0", nodeAId: "B", nodeBId: "A" }];
    const judged: EdgeJudgeResult = {
      edges: [
        {
          pairId: "p0",
          relation: "requires",
          direction: "aToB",
          weight: null,
          confidence: 0.9,
          reasoning: "x",
        },
      ],
      methodNodes: [],
    };
    const plan = planEdgeJudgeResult({
      judged,
      pairs,
      existingEdges,
      nodeIdByLabel: new Map(),
      ...testDefaults,
    });
    expect(plan.edgesToUpsert).toHaveLength(0);
    expect(plan.rejectedCyclicEdges).toEqual([{ source_id: "B", target_id: "A" }]);
  });

  it("prevents two requires edges within the same batch from jointly forming a cycle", () => {
    const pairs: JudgedPairContext[] = [
      { pairId: "p0", nodeAId: "A", nodeBId: "B" },
      { pairId: "p1", nodeAId: "B", nodeBId: "A" },
    ];
    const judged: EdgeJudgeResult = {
      edges: [
        {
          pairId: "p0",
          relation: "requires",
          direction: "aToB",
          weight: null,
          confidence: 0.9,
          reasoning: "x",
        },
        {
          pairId: "p1",
          relation: "requires",
          direction: "aToB",
          weight: null,
          confidence: 0.9,
          reasoning: "x",
        },
      ],
      methodNodes: [],
    };
    const plan = planEdgeJudgeResult({
      judged,
      pairs,
      existingEdges: [],
      nodeIdByLabel: new Map(),
      ...testDefaults,
    });
    expect(plan.edgesToUpsert).toHaveLength(1);
    expect(plan.rejectedCyclicEdges).toHaveLength(1);
  });

  it("skips a judgment whose pairId is unknown", () => {
    const judged: EdgeJudgeResult = {
      edges: [
        {
          pairId: "missing",
          relation: "requires",
          direction: "aToB",
          weight: null,
          confidence: 0.9,
          reasoning: "x",
        },
      ],
      methodNodes: [],
    };
    const plan = planEdgeJudgeResult({
      judged,
      pairs: [],
      existingEdges: [],
      nodeIdByLabel: new Map(),
      ...testDefaults,
    });
    expect(plan.edgesToUpsert).toHaveLength(0);
  });

  it("skips unrelated judgments", () => {
    const pairs: JudgedPairContext[] = [{ pairId: "p0", nodeAId: "A", nodeBId: "B" }];
    const judged: EdgeJudgeResult = {
      edges: [
        {
          pairId: "p0",
          relation: "unrelated",
          direction: null,
          weight: null,
          confidence: 0.5,
          reasoning: "x",
        },
      ],
      methodNodes: [],
    };
    const plan = planEdgeJudgeResult({
      judged,
      pairs,
      existingEdges: [],
      nodeIdByLabel: new Map(),
      ...testDefaults,
    });
    expect(plan.edgesToUpsert).toHaveLength(0);
  });
});

describe("planEdgeJudgeResult helps edges", () => {
  it("plans a helps edge from A to B with the judged weight", () => {
    const pairs: JudgedPairContext[] = [{ pairId: "p0", nodeAId: "A", nodeBId: "B" }];
    const judged: EdgeJudgeResult = {
      edges: [
        {
          pairId: "p0",
          relation: "helps",
          direction: null,
          weight: 0.7,
          confidence: 0.6,
          reasoning: "x",
        },
      ],
      methodNodes: [],
    };
    const plan = planEdgeJudgeResult({
      judged,
      pairs,
      existingEdges: [],
      nodeIdByLabel: new Map(),
      ...testDefaults,
    });
    expect(plan.edgesToUpsert[0]).toMatchObject({ edge_type: "helps", weight: 0.7 });
  });

  it("defaults weight to 0.5 when the model omits it", () => {
    const pairs: JudgedPairContext[] = [{ pairId: "p0", nodeAId: "A", nodeBId: "B" }];
    const judged: EdgeJudgeResult = {
      edges: [
        {
          pairId: "p0",
          relation: "helps",
          direction: null,
          weight: null,
          confidence: 0.6,
          reasoning: "x",
        },
      ],
      methodNodes: [],
    };
    const plan = planEdgeJudgeResult({
      judged,
      pairs,
      existingEdges: [],
      nodeIdByLabel: new Map(),
      ...testDefaults,
    });
    expect(plan.edgesToUpsert[0]?.weight).toBe(0.5);
  });
});

describe("planEdgeJudgeResult method nodes", () => {
  it("creates a method node with helps edges to resolved labels", () => {
    const judged: EdgeJudgeResult = {
      edges: [],
      methodNodes: [
        {
          label: "费曼技巧",
          summary: "用简单语言复述",
          helpsLabels: ["导数"],
          weight: 0.8,
          confidence: 0.7,
        },
      ],
    };
    const plan = planEdgeJudgeResult({
      judged,
      pairs: [],
      existingEdges: [],
      nodeIdByLabel: new Map([["导数", "derivative"]]),
      ...testDefaults,
    });
    expect(plan.methodNodesToInsert).toHaveLength(1);
    expect(plan.methodNodesToInsert[0]).toMatchObject({ kind: "method", label: "费曼技巧" });
    expect(plan.edgesToUpsert).toHaveLength(1);
    expect(plan.edgesToUpsert[0]).toMatchObject({
      target_id: "derivative",
      edge_type: "helps",
      weight: 0.8,
    });
  });

  it("skips a method-node proposal whose labels resolve to nothing known", () => {
    const judged: EdgeJudgeResult = {
      edges: [],
      methodNodes: [
        {
          label: "费曼技巧",
          summary: "s",
          helpsLabels: ["不存在的知识点"],
          weight: 0.8,
          confidence: 0.7,
        },
      ],
    };
    const plan = planEdgeJudgeResult({
      judged,
      pairs: [],
      existingEdges: [],
      nodeIdByLabel: new Map(),
      ...testDefaults,
    });
    expect(plan.methodNodesToInsert).toHaveLength(0);
    expect(plan.edgesToUpsert).toHaveLength(0);
  });

  it("resolves a second proposal's helpsLabels against the first proposal's own label", () => {
    const judged: EdgeJudgeResult = {
      edges: [],
      methodNodes: [
        { label: "间隔重复", summary: "s1", helpsLabels: ["导数"], weight: 0.6, confidence: 0.6 },
        {
          label: "衍生方法",
          summary: "s2",
          helpsLabels: ["间隔重复"],
          weight: 0.5,
          confidence: 0.5,
        },
      ],
    };
    const plan = planEdgeJudgeResult({
      judged,
      pairs: [],
      existingEdges: [],
      nodeIdByLabel: new Map([["导数", "derivative"]]),
      ...testDefaults,
    });
    expect(plan.methodNodesToInsert).toHaveLength(2);
    expect(plan.edgesToUpsert).toHaveLength(2);
  });
});

describe("planEdgeJudgeResult with no findings", () => {
  it("returns an empty plan for an empty judged result", () => {
    const plan = planEdgeJudgeResult({
      judged: emptyJudged(),
      pairs: [],
      existingEdges: [],
      nodeIdByLabel: new Map(),
      ...testDefaults,
    });
    expect(plan).toEqual({ edgesToUpsert: [], methodNodesToInsert: [], rejectedCyclicEdges: [] });
  });
});
