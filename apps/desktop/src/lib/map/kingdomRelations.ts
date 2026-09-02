/**
 * Purpose: what the selected concept is connected to (spec 049) — the card's relation list
 * (parent, children, prerequisites, helpers, all restricted to concepts visible in this
 * kingdom) and the branch the region mirror reads, which is the concept plus everything
 * under it: a branch is one topic. Pure; no I/O, no rendering.
 * Main exports: NodeRelations, kingdomRelations, kingdomCardSubtreeIds.
 */
import type { KnowledgeEdgeRow } from "@breadcrumb/core-db";
import type { KingdomViewNode } from "./kingdomView";

export interface NodeRelations {
  parent: { id: string; label: string } | null;
  children: { id: string; label: string }[];
  /** Sources of requires-edges pointing at this node — its prerequisites. */
  prerequisites: { id: string; label: string }[];
  /** Sources of helps-edges pointing at this node — what aids it. */
  helpers: { id: string; label: string }[];
}

export function kingdomRelations(
  cardNode: KingdomViewNode | null,
  nodeById: ReadonlyMap<string, KingdomViewNode>,
  viewNodes: readonly KingdomViewNode[],
  edges: readonly KnowledgeEdgeRow[],
): NodeRelations {
  if (cardNode === null) return { parent: null, children: [], prerequisites: [], helpers: [] };
  const label = (id: string) => nodeById.get(id)?.label ?? id;
  const inSet = (id: string) => nodeById.has(id);
  return {
    parent:
      cardNode.parentId === null
        ? null
        : { id: cardNode.parentId, label: label(cardNode.parentId) },
    children: viewNodes
      .filter((node) => node.parentId === cardNode.id)
      .map((node) => ({ id: node.id, label: node.label })),
    prerequisites: edges
      .filter(
        (e) => e.target_id === cardNode.id && e.edge_type === "requires" && inSet(e.source_id),
      )
      .map((e) => ({ id: e.source_id, label: label(e.source_id) })),
    helpers: edges
      .filter((e) => e.target_id === cardNode.id && e.edge_type === "helps" && inSet(e.source_id))
      .map((e) => ({ id: e.source_id, label: label(e.source_id) })),
  };
}

/** The mirror reads the selected concept AND everything under it — a branch is one topic. */
export function kingdomCardSubtreeIds(
  cardNode: KingdomViewNode | null,
  viewNodes: readonly KingdomViewNode[],
): ReadonlySet<string> {
  if (cardNode === null) return new Set<string>();
  const childrenByParent = new Map<string | null, KingdomViewNode[]>();
  for (const node of viewNodes) {
    const list = childrenByParent.get(node.parentId) ?? [];
    list.push(node);
    childrenByParent.set(node.parentId, list);
  }
  const collected = new Set<string>();
  const queue = [cardNode.id];
  while (queue.length > 0) {
    const id = queue.pop();
    if (id === undefined || collected.has(id)) continue;
    collected.add(id);
    for (const child of childrenByParent.get(id) ?? []) queue.push(child.id);
  }
  return collected;
}
