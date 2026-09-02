/**
 * Purpose: pure display logic for the third zoom level (spec 049) — node state derivation
 * (structure/progress split), auto/manual collapse into honest aggregates, lateral-edge
 * visibility (focus + context), and primary/alternate recommendation picking with the goal
 * domain filter. No I/O, no rendering.
 * Main exports: KingdomNodeState, KingdomViewNode, deriveKingdomNodes, computeVisibleTree,
 * visibleLateralEdges, pickRecommendation, VISIBLE_NODE_BUDGET.
 */
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { FrontierCandidate } from "@breadcrumb/feature-planner";

/** 已完成 / 走过（含"进行中"的近似，见 spec 049 数据映射）/ 未接触。 */
export type KingdomNodeState = "done" | "visited" | "untouched";

export interface KingdomViewNode {
  id: string;
  label: string;
  summary: string;
  createdAt: string;
  /** Parent within the kingdom subtree; the kingdom root's parent is null here. */
  parentId: string | null;
  state: KingdomNodeState;
  inGoalDomain: boolean;
}

/** Above this many visible nodes, eligible untouched deep subtrees auto-collapse. */
export const VISIBLE_NODE_BUDGET = 45;

/** Sibling order is the concepts' own creation order — never mastery state (stability
 * rule: the terrain must not move because flags changed). */
function byCreatedAt(a: KnowledgeNodeRow, b: KnowledgeNodeRow): number {
  return a.created_at === b.created_at
    ? a.id.localeCompare(b.id)
    : a.created_at.localeCompare(b.created_at);
}

export function deriveKingdomNodes(input: {
  members: readonly KnowledgeNodeRow[];
  masteryByNode: ReadonlyMap<string, number>;
  litThreshold: number;
  sightedNodeIds: ReadonlySet<string>;
  goalDomainNodeIds: ReadonlySet<string>;
}): KingdomViewNode[] {
  const memberIds = new Set(input.members.map((node) => node.id));
  return [...input.members].sort(byCreatedAt).map((node) => {
    const lit = (input.masteryByNode.get(node.id) ?? 0) >= input.litThreshold;
    const state: KingdomNodeState = lit
      ? "done"
      : input.sightedNodeIds.has(node.id)
        ? "visited"
        : "untouched";
    return {
      id: node.id,
      label: node.label,
      summary: node.summary,
      createdAt: node.created_at,
      parentId: node.parent_id !== null && memberIds.has(node.parent_id) ? node.parent_id : null,
      state,
      inGoalDomain: input.goalDomainNodeIds.has(node.id),
    };
  });
}

export interface VisibleTreeNode extends KingdomViewNode {
  /** Non-null marks an aggregate standing in for its whole collapsed subtree. */
  collapsedCount: number | null;
}

/** Applies manual and (over budget) automatic collapsing. A subtree may auto-collapse only
 * when it sits at depth ≥ 2, is entirely untouched (footprints stay visible forever), and
 * contains neither the recommendation nor any goal-domain node. Aggregates report their
 * true size. Manual choices always win over the automatic rule. */
export function computeVisibleTree(input: {
  nodes: readonly KingdomViewNode[];
  nextNodeId: string | null;
  manualCollapsedIds: ReadonlySet<string>;
  manualExpandedIds: ReadonlySet<string>;
  budget?: number;
}): VisibleTreeNode[] {
  const budget = input.budget ?? VISIBLE_NODE_BUDGET;
  const byId = new Map(input.nodes.map((node) => [node.id, node]));
  const children = new Map<string | null, KingdomViewNode[]>();
  for (const node of input.nodes) {
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  const depthOf = (node: KingdomViewNode): number => {
    let depth = 0;
    let current = node;
    while (current.parentId !== null) {
      const parent = byId.get(current.parentId);
      if (parent === undefined) break;
      current = parent;
      depth += 1;
    }
    return depth;
  };
  const subtreeOf = (rootId: string): KingdomViewNode[] => {
    const result: KingdomViewNode[] = [];
    const stack = [rootId];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      const node = byId.get(id);
      if (node === undefined) continue;
      result.push(node);
      for (const child of children.get(id) ?? []) stack.push(child.id);
    }
    return result;
  };

  const autoEligible = (node: KingdomViewNode): boolean => {
    if (depthOf(node) < 2) return false;
    const subtree = subtreeOf(node.id);
    if (subtree.length < 2) return false;
    return subtree.every(
      (member) =>
        member.state === "untouched" && !member.inGoalDomain && member.id !== input.nextNodeId,
    );
  };

  const overBudget = input.nodes.length > budget;
  const collapsedRoots = new Set<string>();
  for (const node of input.nodes) {
    if (input.manualExpandedIds.has(node.id)) continue;
    if (input.manualCollapsedIds.has(node.id) && (children.get(node.id) ?? []).length > 0) {
      collapsedRoots.add(node.id);
      continue;
    }
    if (overBudget && autoEligible(node)) collapsedRoots.add(node.id);
  }

  // A collapsed root inside another collapsed subtree is subsumed by the outer one.
  const isInsideCollapsed = (node: KingdomViewNode): boolean => {
    let current = node;
    while (current.parentId !== null) {
      if (collapsedRoots.has(current.parentId)) return true;
      const parent = byId.get(current.parentId);
      if (parent === undefined) break;
      current = parent;
    }
    return false;
  };

  const visible: VisibleTreeNode[] = [];
  for (const node of input.nodes) {
    if (isInsideCollapsed(node)) continue;
    if (collapsedRoots.has(node.id)) {
      visible.push({ ...node, collapsedCount: subtreeOf(node.id).length });
    } else {
      visible.push({ ...node, collapsedCount: null });
    }
  }
  return visible;
}

export interface LateralEdgeView {
  sourceId: string;
  targetId: string;
  edgeType: "requires" | "helps";
}

/** Focus + context: by default only the edges touching the recommendation show (they are
 * the recommendation's reason drawn as lines); a focused node lights its whole
 * neighbourhood; the show-all switch overrides everything. Both endpoints must be visible. */
export function visibleLateralEdges(input: {
  edges: readonly KnowledgeEdgeRow[];
  visibleIds: ReadonlySet<string>;
  nextNodeId: string | null;
  focusNodeId: string | null;
  showAll: boolean;
}): LateralEdgeView[] {
  return input.edges
    .filter(
      (edge) =>
        input.visibleIds.has(edge.source_id) &&
        input.visibleIds.has(edge.target_id) &&
        (input.showAll ||
          edge.source_id === input.nextNodeId ||
          edge.target_id === input.nextNodeId ||
          (input.focusNodeId !== null &&
            (edge.source_id === input.focusNodeId || edge.target_id === input.focusNodeId))),
    )
    .map((edge) => ({
      sourceId: edge.source_id,
      targetId: edge.target_id,
      edgeType: edge.edge_type,
    }));
}

export interface RecommendationPick {
  /** Null when the region is fully done (regionDone) or has no members. */
  primary: FrontierCandidate | null;
  alternates: FrontierCandidate[];
  regionDone: boolean;
}

/** One primary invitation, a couple of alternates on demand. With a goal domain, only
 * domain members qualify. With no frontier candidate at all: untouched region → invite the
 * entry node (synthesised candidate, empty reason); fully done region → no marker. */
export function pickRecommendation(input: {
  candidates: readonly FrontierCandidate[];
  memberIds: ReadonlySet<string>;
  goalDomainNodeIds: ReadonlySet<string>;
  nodes: readonly KingdomViewNode[];
}): RecommendationPick {
  const domainActive = input.goalDomainNodeIds.size > 0;
  const eligible = input.candidates.filter(
    (candidate) =>
      input.memberIds.has(candidate.nodeId) &&
      (!domainActive || input.goalDomainNodeIds.has(candidate.nodeId)),
  );
  if (eligible.length > 0) {
    return { primary: eligible[0] ?? null, alternates: eligible.slice(1, 3), regionDone: false };
  }
  const regionDone = input.nodes.length > 0 && input.nodes.every((node) => node.state === "done");
  if (regionDone) return { primary: null, alternates: [], regionDone: true };
  const entry = input.nodes.find((node) => node.parentId === null && node.state !== "done");
  if (entry === undefined) return { primary: null, alternates: [], regionDone: false };
  return {
    primary: {
      nodeId: entry.id,
      label: entry.label,
      // Synthesised, not produced by frontier(): an entry node stands in for a region nobody
      // has touched yet, and entry nodes are always concepts.
      kind: "concept",
      score: 0,
      reason: { litPrerequisiteLabels: [], litHelpsSources: [], wasLitBefore: false },
    },
    alternates: [],
    regionDone: false,
  };
}
