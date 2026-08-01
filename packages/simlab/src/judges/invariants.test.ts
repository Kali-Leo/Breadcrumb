/**
 * Purpose: unit tests for the pure invariant checks, including bad-data self-checks (a
 * cyclic edge and a duplicate label must both be reported, proving the assertions actually
 * test something rather than vacuously passing).
 */
import type { GoalRow, KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { FrontierCandidate } from "@breadcrumb/plugin-planner";
import { describe, expect, it } from "vitest";
import { runInvariants } from "./invariants";

function node(id: string, label: string): KnowledgeNodeRow {
  return {
    id,
    parent_id: null,
    label,
    summary: "s",
    kind: "concept",
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

function requires(source: string, target: string): KnowledgeEdgeRow {
  return {
    id: `${source}->${target}`,
    source_id: source,
    target_id: target,
    edge_type: "requires",
    weight: 1,
    confidence: 0.9,
    origin: "llm",
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

const BASE = {
  masteryByNode: new Map<string, number>(),
  interestByNode: new Map<string, number>(),
  frontierCandidates: [] as FrontierCandidate[],
  goals: [] as GoalRow[],
  litThreshold: 0.85,
};

describe("runInvariants: acyclic (bad-data self-check)", () => {
  it("reports nothing for a clean DAG", () => {
    const nodes = [node("a", "A"), node("b", "B")];
    const violations = runInvariants({ ...BASE, nodes, edges: [requires("a", "b")] });
    expect(violations).toEqual([]);
  });

  it("catches a directly-injected cyclic edge set", () => {
    const nodes = [node("a", "A"), node("b", "B"), node("c", "C")];
    const edges = [requires("a", "b"), requires("b", "c"), requires("c", "a")];
    const violations = runInvariants({ ...BASE, nodes, edges });
    expect(violations.some((v) => v.kind === "cycle")).toBe(true);
  });
});

describe("runInvariants: unique labels (bad-data self-check)", () => {
  it("catches a directly-injected duplicate label", () => {
    const nodes = [node("a", "闭包"), node("b", "闭包")];
    const violations = runInvariants({ ...BASE, nodes, edges: [] });
    expect(violations).toEqual([
      { kind: "duplicate-label", detail: 'label "闭包" appears 2 times' },
    ]);
  });
});

describe("runInvariants: mastery/interest range", () => {
  it("catches an out-of-range mastery value", () => {
    const nodes = [node("a", "A")];
    const violations = runInvariants({
      ...BASE,
      nodes,
      edges: [],
      masteryByNode: new Map([["a", 1.5]]),
    });
    expect(violations.some((v) => v.kind === "mastery-out-of-range")).toBe(true);
  });

  it("catches a negative interest value", () => {
    const nodes = [node("a", "A")];
    const violations = runInvariants({
      ...BASE,
      nodes,
      edges: [],
      interestByNode: new Map([["a", -0.1]]),
    });
    expect(violations.some((v) => v.kind === "interest-out-of-range")).toBe(true);
  });
});

describe("runInvariants: frontier hard gate and reason honesty", () => {
  it("passes a candidate whose cited prerequisite really is lit", () => {
    const nodes = [node("a", "A"), node("b", "B")];
    const edges = [requires("a", "b")];
    const candidate: FrontierCandidate = {
      nodeId: "b",
      label: "B",
      score: 1,
      reason: { litPrerequisiteLabels: ["A"], litHelpsSources: [], wasLitBefore: false },
    };
    const violations = runInvariants({
      ...BASE,
      nodes,
      edges,
      masteryByNode: new Map([["a", 0.9]]),
      frontierCandidates: [candidate],
    });
    expect(violations).toEqual([]);
  });

  it("catches a candidate surfaced despite an unlit prerequisite (hard-gate violation)", () => {
    const nodes = [node("a", "A"), node("b", "B")];
    const edges = [requires("a", "b")];
    const candidate: FrontierCandidate = {
      nodeId: "b",
      label: "B",
      score: 1,
      reason: { litPrerequisiteLabels: ["A"], litHelpsSources: [], wasLitBefore: false },
    };
    const violations = runInvariants({
      ...BASE,
      nodes,
      edges,
      masteryByNode: new Map([["a", 0.1]]), // not lit
      frontierCandidates: [candidate],
    });
    expect(violations.some((v) => v.kind === "frontier-hard-gate")).toBe(true);
  });

  it("catches a reason that fabricates a prerequisite not actually required", () => {
    const nodes = [node("a", "A"), node("b", "B")];
    const candidate: FrontierCandidate = {
      nodeId: "b",
      label: "B",
      score: 1,
      reason: { litPrerequisiteLabels: ["A"], litHelpsSources: [], wasLitBefore: false }, // no real requires edge exists
    };
    const violations = runInvariants({
      ...BASE,
      nodes,
      edges: [],
      frontierCandidates: [candidate],
    });
    expect(violations.some((v) => v.kind === "frontier-reason-mismatch")).toBe(true);
  });
});

describe("runInvariants: coverage arithmetic", () => {
  it("passes correct coverage", () => {
    const nodes = [node("a", "A"), node("b", "B")];
    const goal: GoalRow = {
      id: "g1",
      title: "goal",
      node_ids_json: JSON.stringify(["a", "b"]),
      created_at: "x",
      updated_at: "x",
    };
    const violations = runInvariants({
      ...BASE,
      nodes,
      edges: [],
      masteryByNode: new Map([
        ["a", 0.9],
        ["b", 0.1],
      ]),
      goals: [goal],
    });
    expect(violations).toEqual([]);
  });
});

describe("runInvariants: duplicate goal title (bad-data self-check)", () => {
  function goal(id: string, title: string): GoalRow {
    return { id, title, node_ids_json: "[]", created_at: "x", updated_at: "x" };
  }

  it("passes distinct goal titles", () => {
    const violations = runInvariants({
      ...BASE,
      nodes: [],
      edges: [],
      goals: [goal("g1", "学会：闭包"), goal("g2", "学会：递归")],
    });
    expect(violations).toEqual([]);
  });

  it("catches two goal rows sharing the identical trimmed title", () => {
    const violations = runInvariants({
      ...BASE,
      nodes: [],
      edges: [],
      goals: [goal("g1", "学会：闭包"), goal("g2", "学会：闭包 ")], // trailing space still a dup
    });
    expect(violations).toEqual([
      { kind: "duplicate-goal-title", detail: 'title "学会：闭包" appears on 2 goal rows' },
    ]);
  });
});
