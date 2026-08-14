/**
 * Purpose: pure functions building spec 040's message tree from a conversation's flat message
 * rows — explicit parent_id links plus implicit (NULL) legacy-linear chaining unify into one
 * tree, from which the active path, fork points, and per-leaf paths are derived.
 * Main exports: MessageTreeNode, effectiveParentById, buildMessageTree, newestLeafId,
 * pathToLeaf, activePath, forkPoints.
 */
import type { MessageRow } from "@breadcrumb/core-db";

export interface MessageTreeNode {
  message: MessageRow;
  children: MessageTreeNode[];
}

/** Deterministic order: created_at ascending, id as tiebreaker. */
function sortedRows(rows: readonly MessageRow[]): MessageRow[] {
  return [...rows].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Effective parent id per row: the explicit parent_id when it references another row present
 * in `rows`, else the previous row by (created_at, id) — the legacy-linear reading of a NULL
 * parent_id, or the fault-tolerant reading of a parent_id pointing outside this row set (both
 * fall back to "root" when there is no previous row, i.e. the first row overall). */
export function effectiveParentById(rows: readonly MessageRow[]): Map<string, string | null> {
  const ordered = sortedRows(rows);
  const ids = new Set(ordered.map((row) => row.id));
  const result = new Map<string, string | null>();
  ordered.forEach((row, index) => {
    if (row.parent_id !== null && ids.has(row.parent_id)) {
      result.set(row.id, row.parent_id);
      return;
    }
    const previous = ordered[index - 1];
    result.set(row.id, previous ? previous.id : null);
  });
  return result;
}

/** Builds the forest of root messages (usually one root per conversation, but a malformed or
 * partial row set can yield more than one). */
export function buildMessageTree(rows: readonly MessageRow[]): MessageTreeNode[] {
  const ordered = sortedRows(rows);
  const parentById = effectiveParentById(ordered);
  const nodeById = new Map<string, MessageTreeNode>();
  for (const row of ordered) nodeById.set(row.id, { message: row, children: [] });
  const roots: MessageTreeNode[] = [];
  for (const row of ordered) {
    const node = nodeById.get(row.id);
    if (!node) continue;
    const parentId = parentById.get(row.id) ?? null;
    const parentNode = parentId !== null ? nodeById.get(parentId) : undefined;
    if (parentNode) parentNode.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** The id of the most recently created leaf (a message with no children), ties broken by id.
 * Returns null for an empty row set — "reopen lands on the newest leaf's path". */
export function newestLeafId(rows: readonly MessageRow[]): string | null {
  const ordered = sortedRows(rows);
  if (ordered.length === 0) return null;
  const parentById = effectiveParentById(ordered);
  const parentIds = new Set([...parentById.values()].filter((id): id is string => id !== null));
  const leaves = ordered.filter((row) => !parentIds.has(row.id));
  const newest = leaves.reduce<MessageRow | null>((best, row) => {
    if (!best) return row;
    if (row.created_at !== best.created_at) return row.created_at > best.created_at ? row : best;
    return row.id > best.id ? row : best;
  }, null);
  return newest ? newest.id : null;
}

/** Root-to-leaf path, inclusive of the leaf. Empty array when leafId isn't present in rows.
 * A visited-set guards against a malformed parent cycle looping forever. */
export function pathToLeaf(rows: readonly MessageRow[], leafId: string): MessageRow[] {
  const ordered = sortedRows(rows);
  const byId = new Map(ordered.map((row) => [row.id, row]));
  if (!byId.has(leafId)) return [];
  const parentById = effectiveParentById(ordered);
  const path: MessageRow[] = [];
  const visited = new Set<string>();
  let currentId: string | null = leafId;
  while (currentId !== null && !visited.has(currentId)) {
    const row = byId.get(currentId);
    if (!row) break;
    path.push(row);
    visited.add(currentId);
    currentId = parentById.get(currentId) ?? null;
  }
  return path.reverse();
}

/** The path from root to the newest leaf — "reopen lands where you left off". */
export function activePath(rows: readonly MessageRow[]): MessageRow[] {
  const leafId = newestLeafId(rows);
  return leafId === null ? [] : pathToLeaf(rows, leafId);
}

/** Ids of messages with 2+ children — where the tree forks into visible branches. */
export function forkPoints(rows: readonly MessageRow[]): ReadonlySet<string> {
  const parentById = effectiveParentById(sortedRows(rows));
  const counts = new Map<string, number>();
  for (const parentId of parentById.values()) {
    if (parentId === null) continue;
    counts.set(parentId, (counts.get(parentId) ?? 0) + 1);
  }
  const forks = new Set<string>();
  for (const [id, count] of counts) if (count >= 2) forks.add(id);
  return forks;
}
