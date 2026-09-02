/**
 * Purpose: unit tests for the third level's pure display logic (spec 049) — state
 * derivation with stable sibling order, honest auto/manual collapsing, focus+context
 * lateral-edge visibility, and recommendation picking with the goal domain filter.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { FrontierCandidate } from "@breadcrumb/feature-planner";
import { describe, expect, it } from "vitest";
import {
  computeVisibleTree,
  deriveKingdomNodes,
  type KingdomViewNode,
  pickRecommendation,
  visibleLateralEdges,
} from "./kingdomView";

function nodeRow(id: string, parentId: string | null, createdAt: string): KnowledgeNodeRow {
  return {
    id,
    parent_id: parentId,
    label: id,
    summary: `关于 ${id}`,
    created_at: createdAt,
    kind: "concept",
  };
}

function candidate(nodeId: string, score: number): FrontierCandidate {
  return {
    nodeId,
    label: nodeId,
    kind: "concept",
    score,
    reason: { litPrerequisiteLabels: [], litHelpsSources: [], wasLitBefore: false },
  };
}

const T = (n: number) => `2026-08-0${n}T00:00:00.000Z`;

describe("deriveKingdomNodes", () => {
  it("derives done/visited/untouched and keeps sibling order by creation, not mastery", () => {
    const members = [
      nodeRow("b", "root", T(2)),
      nodeRow("root", null, T(1)),
      nodeRow("a", "root", T(3)),
    ];
    const nodes = deriveKingdomNodes({
      members,
      masteryByNode: new Map([["a", 0.9]]),
      litThreshold: 0.5,
      sightedNodeIds: new Set(["b"]),
      goalDomainNodeIds: new Set(),
    });
    expect(nodes.map((node) => node.id)).toEqual(["root", "b", "a"]);
    expect(nodes.find((node) => node.id === "a")?.state).toBe("done");
    expect(nodes.find((node) => node.id === "b")?.state).toBe("visited");
    expect(nodes.find((node) => node.id === "root")?.state).toBe("untouched");
  });

  it("re-roots parents that live outside the kingdom", () => {
    const members = [nodeRow("k", "outside", T(1)), nodeRow("c", "k", T(2))];
    const nodes = deriveKingdomNodes({
      members,
      masteryByNode: new Map(),
      litThreshold: 0.5,
      sightedNodeIds: new Set(),
      goalDomainNodeIds: new Set(),
    });
    expect(nodes.find((node) => node.id === "k")?.parentId).toBeNull();
    expect(nodes.find((node) => node.id === "c")?.parentId).toBe("k");
  });
});

function viewNode(
  id: string,
  parentId: string | null,
  state: KingdomViewNode["state"],
  inGoalDomain = false,
): KingdomViewNode {
  return { id, label: id, summary: "", createdAt: T(1), parentId, state, inGoalDomain };
}

describe("computeVisibleTree", () => {
  // root → mid → many untouched leaves: an eligible deep subtree.
  function bigTree(): KingdomViewNode[] {
    const nodes = [viewNode("root", null, "done"), viewNode("mid", "root", "done")];
    nodes.push(viewNode("deep", "mid", "untouched"));
    for (let i = 0; i < 50; i += 1) nodes.push(viewNode(`leaf${i}`, "deep", "untouched"));
    return nodes;
  }

  it("collapses an eligible untouched deep subtree into an honest aggregate when over budget", () => {
    const visible = computeVisibleTree({
      nodes: bigTree(),
      nextNodeId: null,
      manualCollapsedIds: new Set(),
      manualExpandedIds: new Set(),
      budget: 10,
    });
    const aggregate = visible.find((node) => node.id === "deep");
    expect(aggregate?.collapsedCount).toBe(51);
    expect(visible).toHaveLength(3);
  });

  it("never auto-collapses a subtree holding footprints, the recommendation or the goal domain", () => {
    const withFootprint = bigTree().map((node) =>
      node.id === "leaf0" ? { ...node, state: "visited" as const } : node,
    );
    const visible = computeVisibleTree({
      nodes: withFootprint,
      nextNodeId: null,
      manualCollapsedIds: new Set(),
      manualExpandedIds: new Set(),
      budget: 10,
    });
    expect(visible.find((node) => node.id === "deep")?.collapsedCount).toBeNull();

    const withNext = computeVisibleTree({
      nodes: bigTree(),
      nextNodeId: "leaf3",
      manualCollapsedIds: new Set(),
      manualExpandedIds: new Set(),
      budget: 10,
    });
    expect(withNext.find((node) => node.id === "deep")?.collapsedCount).toBeNull();
  });

  it("stays fully expanded under budget; manual choices override both ways", () => {
    const under = computeVisibleTree({
      nodes: bigTree(),
      nextNodeId: null,
      manualCollapsedIds: new Set(),
      manualExpandedIds: new Set(),
      budget: 100,
    });
    expect(under.every((node) => node.collapsedCount === null)).toBe(true);

    const manualCollapse = computeVisibleTree({
      nodes: bigTree(),
      nextNodeId: null,
      manualCollapsedIds: new Set(["mid"]),
      manualExpandedIds: new Set(),
      budget: 100,
    });
    expect(manualCollapse.find((node) => node.id === "mid")?.collapsedCount).toBe(52);

    const manualExpand = computeVisibleTree({
      nodes: bigTree(),
      nextNodeId: null,
      manualCollapsedIds: new Set(),
      manualExpandedIds: new Set(["deep"]),
      budget: 10,
    });
    expect(manualExpand.find((node) => node.id === "deep")?.collapsedCount).toBeNull();
  });
});

describe("visibleLateralEdges", () => {
  const edge = (source: string, target: string, type: "requires" | "helps"): KnowledgeEdgeRow => ({
    id: `${source}-${target}`,
    source_id: source,
    target_id: target,
    edge_type: type,
    weight: 1,
    confidence: 1,
    origin: "llm",
    created_at: T(1),
  });
  const edges = [edge("a", "next", "requires"), edge("b", "c", "helps")];
  const visibleIds = new Set(["a", "b", "c", "next"]);

  it("shows only the recommendation's edges by default, the focus neighbourhood on demand, everything with the switch", () => {
    const byDefault = visibleLateralEdges({
      edges,
      visibleIds,
      nextNodeId: "next",
      focusNodeId: null,
      showAll: false,
    });
    expect(byDefault.map((e) => e.targetId)).toEqual(["next"]);

    const focused = visibleLateralEdges({
      edges,
      visibleIds,
      nextNodeId: "next",
      focusNodeId: "b",
      showAll: false,
    });
    expect(focused).toHaveLength(2);

    const all = visibleLateralEdges({
      edges,
      visibleIds,
      nextNodeId: null,
      focusNodeId: null,
      showAll: true,
    });
    expect(all).toHaveLength(2);
  });
});

describe("pickRecommendation", () => {
  const nodes = [
    viewNode("root", null, "done"),
    viewNode("a", "root", "untouched", true),
    viewNode("b", "root", "untouched"),
  ];

  it("picks the top member candidate, restricted to the goal domain when one exists", () => {
    const pick = pickRecommendation({
      candidates: [candidate("b", 0.9), candidate("a", 0.5)],
      memberIds: new Set(["root", "a", "b"]),
      goalDomainNodeIds: new Set(["a"]),
      nodes,
    });
    expect(pick.primary?.nodeId).toBe("a");
  });

  it("falls back to the entry node for an untouched region and to none when all is done", () => {
    const untouched = nodes.map((node) => ({ ...node, state: "untouched" as const }));
    const entry = pickRecommendation({
      candidates: [],
      memberIds: new Set(["root", "a", "b"]),
      goalDomainNodeIds: new Set(),
      nodes: untouched,
    });
    expect(entry.primary?.nodeId).toBe("root");

    const done = nodes.map((node) => ({ ...node, state: "done" as const }));
    const finished = pickRecommendation({
      candidates: [],
      memberIds: new Set(["root", "a", "b"]),
      goalDomainNodeIds: new Set(),
      nodes: done,
    });
    expect(finished.primary).toBeNull();
    expect(finished.regionDone).toBe(true);
  });
});
