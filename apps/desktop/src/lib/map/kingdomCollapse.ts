/**
 * Purpose: the kingdom tree's honest collapsing (spec 049) — automatic collapse of eligible
 * untouched deep subtrees once the visible-node budget is exceeded, manual collapse/expand
 * always winning over it, and aggregates that report their true size. Pure; no I/O.
 * Main exports: VisibleTreeNode, VISIBLE_NODE_BUDGET, computeVisibleTree.
 */
import type { KingdomViewNode } from "./kingdomView";

/** Above this many visible nodes, eligible untouched deep subtrees auto-collapse. */
export const VISIBLE_NODE_BUDGET = 45;

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
