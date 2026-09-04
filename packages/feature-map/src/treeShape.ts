/**
 * Purpose: reshape the flat knowledge tree into the cartographic hierarchy — islands
 * (depth 0), kingdoms (depth 1), villages (depth 2), knowledge points (depth 3+).
 * Main exports: shapeTree, ShapedIsland, ShapedKingdom, ShapedVillage, ShapedPoint; also
 * exports indexChildren/collectSubtree/shapeKingdom so continentShape.ts and continents.ts
 * reuse the same root resolution and recursion.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";

export interface ShapedPoint {
  nodeId: string;
  label: string;
}

export interface ShapedVillage {
  nodeId: string;
  label: string;
  subtreeCount: number;
  tier: 1 | 2 | 3 | 4;
  points: ShapedPoint[];
  memberNodeIds: string[];
}

export interface ShapedKingdom {
  nodeId: string;
  label: string;
  subtreeCount: number;
  villages: ShapedVillage[];
  memberNodeIds: string[];
}

export interface ShapedIsland {
  nodeId: string;
  label: string;
  createdAt: string;
  subtreeCount: number;
  /** 1..6 — quantized size bucket; coastline is regenerated whenever the tier changes. */
  sizeTier: number;
  kingdoms: ShapedKingdom[];
  memberNodeIds: string[];
}

export type ChildrenByParent = Map<string | null, KnowledgeNodeRow[]>;

/**
 * One id per parent-link cycle — the smallest, so the choice is stable across renders — to be
 * treated as a root, which turns the cycle back into a tree. A cycle can only come from
 * corrupted data (before 2026-09-04 a merge whose duplicate was an ancestor of its canonical
 * built one), and its cost was total: a node on a cycle is in nobody's child bucket AND in no
 * root bucket, so it and its whole subtree vanished from the map with no error anywhere.
 * Cutting one link keeps every node drawable; migration 0053 repairs the stored rows, this
 * keeps the map honest against whatever writes the next one. O(n) — each node is walked once.
 */
function findCycleCutIds(
  nodes: readonly KnowledgeNodeRow[],
  parentOf: ReadonlyMap<string, string>,
): Set<string> {
  const cutIds = new Set<string>();
  const settled = new Set<string>();
  for (const node of nodes) {
    const walked: string[] = [];
    const positionOnWalk = new Map<string, number>();
    let current: string | undefined = node.id;
    while (current !== undefined && !settled.has(current)) {
      const seenAt = positionOnWalk.get(current);
      if (seenAt !== undefined) {
        const cycle = walked.slice(seenAt);
        cutIds.add(cycle.reduce((lowest, id) => (id < lowest ? id : lowest)));
        break;
      }
      positionOnWalk.set(current, walked.length);
      walked.push(current);
      current = parentOf.get(current);
    }
    for (const id of walked) settled.add(id);
  }
  return cutIds;
}

/** Exported so continentShape.ts can scope this same grouping to a continent's member
 * subset (an out-of-scope parent degrades a member to a kingdom root within its continent). */
export function indexChildren(nodes: readonly KnowledgeNodeRow[]): ChildrenByParent {
  const knownIds = new Set(nodes.map((node) => node.id));
  const parentOf = new Map<string, string>();
  for (const node of nodes) {
    if (node.parent_id !== null && knownIds.has(node.parent_id))
      parentOf.set(node.id, node.parent_id);
  }
  const cutIds = findCycleCutIds(nodes, parentOf);
  const childrenByParent: ChildrenByParent = new Map();
  for (const node of nodes) {
    // A dangling parent_id degrades the node to a root — knowledge is never dropped. So does
    // the one link cut out of each cycle, for the same reason.
    const parentKey = cutIds.has(node.id) ? null : (parentOf.get(node.id) ?? null);
    const siblings = childrenByParent.get(parentKey) ?? [];
    siblings.push(node);
    childrenByParent.set(parentKey, siblings);
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((a, b) =>
      a.created_at === b.created_at
        ? a.id.localeCompare(b.id)
        : a.created_at.localeCompare(b.created_at),
    );
  }
  return childrenByParent;
}

/** Exported so continents.ts can size a continent (root subtree) and its kingdoms (each
 * direct child's subtree) with exactly this traversal — root first, then breadth-first. */
export function collectSubtree(
  root: KnowledgeNodeRow,
  children: ChildrenByParent,
): KnowledgeNodeRow[] {
  const collected: KnowledgeNodeRow[] = [];
  const queue: KnowledgeNodeRow[] = [root];
  // indexChildren already cuts every cycle, so this set should never fire. It is here because
  // the cost of being wrong is not a wrong picture but a hung render loop growing an array
  // without bound, and because collectSubtree is exported: a future caller may hand it a
  // `children` map this file did not build.
  const visited = new Set<string>();
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];
    if (node === undefined || visited.has(node.id)) continue;
    visited.add(node.id);
    collected.push(node);
    queue.push(...(children.get(node.id) ?? []));
  }
  return collected;
}

function villageTier(subtreeCount: number): 1 | 2 | 3 | 4 {
  if (subtreeCount >= 10) return 4;
  if (subtreeCount >= 5) return 3;
  if (subtreeCount >= 2) return 2;
  return 1;
}

/** Absolute knowledge-count buckets: 1 → tier 1, 2-3 → 2, 4-7 → 3, … 32+ → 6. */
export function islandSizeTier(subtreeCount: number): number {
  return Math.min(6, Math.floor(Math.log2(subtreeCount)) + 1);
}

function shapeVillage(node: KnowledgeNodeRow, children: ChildrenByParent): ShapedVillage {
  const members = collectSubtree(node, children);
  return {
    nodeId: node.id,
    label: node.label,
    subtreeCount: members.length,
    tier: villageTier(members.length),
    points: members
      .filter((member) => member.id !== node.id)
      .map((member) => ({ nodeId: member.id, label: member.label })),
    memberNodeIds: members.map((member) => member.id),
  };
}

/** Exported so continentShape.ts can shape kingdoms/villages/points inside a continent
 * without duplicating this recursion — identical behavior, just a different root set. */
export function shapeKingdom(node: KnowledgeNodeRow, children: ChildrenByParent): ShapedKingdom {
  const members = collectSubtree(node, children);
  return {
    nodeId: node.id,
    label: node.label,
    subtreeCount: members.length,
    villages: (children.get(node.id) ?? []).map((child) => shapeVillage(child, children)),
    memberNodeIds: members.map((member) => member.id),
  };
}

export function shapeTree(nodes: readonly KnowledgeNodeRow[]): ShapedIsland[] {
  const children = indexChildren(nodes);
  const roots = children.get(null) ?? [];
  return roots.map((root) => {
    const members = collectSubtree(root, children);
    return {
      nodeId: root.id,
      label: root.label,
      createdAt: root.created_at,
      subtreeCount: members.length,
      sizeTier: islandSizeTier(members.length),
      kingdoms: (children.get(root.id) ?? []).map((child) => shapeKingdom(child, children)),
      memberNodeIds: members.map((member) => member.id),
    };
  });
}
