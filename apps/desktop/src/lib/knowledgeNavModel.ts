/**
 * Purpose: pure list-shaping helpers for the knowledge navigation panel — flattening the
 * parent-child node forest and capping the "全部" tab to a bounded recent slice.
 * Main exports: flattenTree, TreeItem, TREE_DISPLAY_CAP, capTreeItems.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";

export interface TreeItem {
  node: KnowledgeNodeRow;
  depth: number;
}

/** Above this count, the "全部" tab shows only the most recently reached slice. */
export const TREE_DISPLAY_CAP = 60;

/** Flattens the parent-child forest into a depth-annotated list (creation order). */
export function flattenTree(nodes: readonly KnowledgeNodeRow[]): TreeItem[] {
  const childrenByParent = new Map<string | null, KnowledgeNodeRow[]>();
  for (const node of nodes) {
    const siblings = childrenByParent.get(node.parent_id) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parent_id, siblings);
  }
  const items: TreeItem[] = [];
  function visit(parentId: string | null, depth: number) {
    for (const node of childrenByParent.get(parentId) ?? []) {
      items.push({ node, depth });
      visit(node.id, depth + 1);
    }
  }
  visit(null, 0);
  return items;
}

/** Caps a flattened list to the most recently reached TREE_DISPLAY_CAP entries — an
 * unbounded list is never rendered. Returns the input unchanged when already within budget. */
export function capTreeItems(items: readonly TreeItem[]): {
  visible: TreeItem[];
  totalCount: number;
  isCapped: boolean;
} {
  const totalCount = items.length;
  const isCapped = totalCount > TREE_DISPLAY_CAP;
  const visible = isCapped ? items.slice(-TREE_DISPLAY_CAP) : [...items];
  return { visible, totalCount, isCapped };
}
