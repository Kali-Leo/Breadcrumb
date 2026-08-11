/**
 * Purpose: memoizes buildWorldModel per (nodes, topicAssignment) pair so re-opening the
 * memory palace or waiting for the async topic assignment to arrive skips the expensive
 * terrain build (identical output, just remembered). Two-level WeakMap: nodes array first,
 * then either the plain (tree-root) slot or a WeakMap keyed by the assignment object.
 * Main exports: cachedWorldModel.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { buildWorldModel, type TopicAssignment, type WorldModel } from "@breadcrumb/plugin-map";

interface WorldCacheEntry {
  plain?: WorldModel;
  byAssignment?: WeakMap<TopicAssignment, WorldModel>;
}

const worldCache = new WeakMap<readonly KnowledgeNodeRow[], WorldCacheEntry>();

export function cachedWorldModel(
  nodes: readonly KnowledgeNodeRow[],
  assignment: TopicAssignment | null,
): WorldModel {
  let entry = worldCache.get(nodes);
  if (entry === undefined) {
    entry = {};
    worldCache.set(nodes, entry);
  }
  if (assignment === null) {
    entry.plain ??= buildWorldModel(nodes);
    return entry.plain;
  }
  entry.byAssignment ??= new WeakMap();
  const cached = entry.byAssignment.get(assignment);
  if (cached !== undefined) return cached;
  const world = buildWorldModel(nodes, assignment);
  entry.byAssignment.set(assignment, world);
  return world;
}
