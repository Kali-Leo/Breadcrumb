/**
 * Purpose: tests for computeOverlayLayout() (spec 017 #2, ADR-0013) — determinism (same node/
 * edge set always yields identical frozen coordinates), scope fidelity (lays out exactly the
 * given nodes, no more no less), and that layout is stable across buildOverlayModel() outputs
 * for the same scope regardless of mastery state (empty/mid/near-complete), matching the design
 * requirement that recompute only re-lays-out when the node set itself changes.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { computeOverlayLayout, overlayNodeRadius } from "./overlayLayout";
import { buildOverlayModel, type OverlayEdge, type OverlayNode } from "./overlayModel";

function overlayNode(
  id: string,
  label: string,
  state: OverlayNode["state"] = "target",
): OverlayNode {
  return { id, label, state, mastery: 0, isNextStep: false, interest: 0, evidenceWeight: 0 };
}

function overlayEdge(
  source: string,
  target: string,
  type: OverlayEdge["type"],
  weight = 1,
): OverlayEdge {
  return { source, target, type, weight };
}

const triangleNodes = [
  overlayNode("a", "Alpha"),
  overlayNode("b", "Beta"),
  overlayNode("c", "Charlie"),
];
const triangleEdges = [
  overlayEdge("a", "b", "requires"),
  overlayEdge("b", "c", "requires"),
  overlayEdge("a", "c", "helps", 0.4),
];

describe("computeOverlayLayout determinism", () => {
  it("produces identical coordinates across repeated calls with the same node/edge set", () => {
    const first = computeOverlayLayout(triangleNodes, triangleEdges);
    const second = computeOverlayLayout(triangleNodes, triangleEdges);
    expect(second).toEqual(first);
  });

  it("freezes fx/fy equal to x/y for every node", () => {
    const layout = computeOverlayLayout(triangleNodes, triangleEdges);
    for (const node of layout.nodes) {
      expect(node.fx).toBe(node.x);
      expect(node.fy).toBe(node.y);
    }
  });

  it("produces only finite coordinates", () => {
    const layout = computeOverlayLayout(triangleNodes, triangleEdges);
    for (const node of layout.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });
});

describe("computeOverlayLayout scope fidelity", () => {
  it("lays out exactly the given node ids — no more, no less", () => {
    const layout = computeOverlayLayout(triangleNodes, triangleEdges);
    expect(layout.nodes.map((node) => node.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("passes edges through unchanged", () => {
    const layout = computeOverlayLayout(triangleNodes, triangleEdges);
    expect(layout.edges).toEqual(triangleEdges);
  });

  it("a smaller scope only lays out its own nodes, unaffected by a prior larger-scope call", () => {
    computeOverlayLayout(triangleNodes, triangleEdges);
    const singleNode = [overlayNode("solo", "Solo")];
    const layout = computeOverlayLayout(singleNode, []);
    expect(layout.nodes.map((node) => node.id)).toEqual(["solo"]);
  });
});

// Same a -> b -> c -> g requires chain as overlayModel.test.ts's fixture, exercised end-to-end
// through buildOverlayModel() so this test reflects what GoalOverlayView actually feeds the
// layout: the same scope re-derived at three different mastery states must freeze to the exact
// same pixels every time — mastery/state never influences where a node sits.
function knowledgeNode(id: string, label: string): KnowledgeNodeRow {
  return {
    id,
    parent_id: null,
    label,
    summary: "",
    kind: "concept",
    created_at: "2026-08-01T00:00:00Z",
  };
}

function requiresEdge(source: string, target: string): KnowledgeEdgeRow {
  return {
    id: `${source}-req-${target}`,
    source_id: source,
    target_id: target,
    edge_type: "requires",
    weight: 1,
    confidence: 0.9,
    origin: "llm",
    created_at: "2026-08-01T00:00:00Z",
  };
}

const chainNodes = [
  knowledgeNode("a", "Alpha"),
  knowledgeNode("b", "Beta"),
  knowledgeNode("c", "Charlie"),
  knowledgeNode("g", "Goal"),
];
const chainEdges = [requiresEdge("a", "b"), requiresEdge("b", "c"), requiresEdge("c", "g")];

function layoutAtMastery(masteryByNode: Map<string, number>) {
  const model = buildOverlayModel({
    goalNodeIds: ["g"],
    nodes: chainNodes,
    edges: chainEdges,
    goalMasteryByNode: masteryByNode,
    interestByNode: new Map(),
    evidenceWeightByNode: new Map(),
    route: null,
    litThreshold: 0.85,
    dimThreshold: 0.3,
  });
  return computeOverlayLayout(model.nodes, model.edges);
}

describe("frozen layout stability across progress states", () => {
  it("empty/mid/near-complete mastery all freeze to the exact same coordinates for the same scope", () => {
    const empty = layoutAtMastery(new Map());
    const mid = layoutAtMastery(
      new Map([
        ["a", 0.9],
        ["b", 0.5],
      ]),
    );
    const nearComplete = layoutAtMastery(
      new Map([
        ["a", 0.9],
        ["b", 0.9],
        ["c", 0.9],
      ]),
    );

    const positionsById = (layout: ReturnType<typeof layoutAtMastery>) =>
      new Map(layout.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));

    expect(positionsById(mid)).toEqual(positionsById(empty));
    expect(positionsById(nearComplete)).toEqual(positionsById(empty));
  });
});

describe("overlayNodeRadius", () => {
  it("grows with label length but is capped", () => {
    expect(overlayNodeRadius("A")).toBeLessThan(overlayNodeRadius("A longer concept label"));
    expect(
      overlayNodeRadius("一个非常非常非常非常非常非常非常长的知识点标签名字"),
    ).toBeLessThanOrEqual(46);
  });
});
