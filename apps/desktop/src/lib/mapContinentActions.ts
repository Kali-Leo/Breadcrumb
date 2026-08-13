/**
 * Purpose: loads everything deriveContinents needs from local SQLite — embeddings, sighting
 * counts, and average curiosity — and turns it into a ContinentAssignment for the memory
 * palace (spec 031), memoized per nodes array so palace reopens hand cachedWorldModel the
 * same object back (identity is the cache key downstream). Best-effort: any failure (DB not
 * ready, malformed embedding rows) degrades to null so the caller falls back to tree-root
 * islands instead of throwing.
 * Main exports: loadContinentAssignment.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { type ContinentAssignment, deriveContinents } from "@breadcrumb/plugin-map";
import { getRepos } from "./db";

function parseEmbeddingVector(vectorJson: string): number[] | null {
  try {
    const parsed = JSON.parse(vectorJson) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "number")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** engagement = 1 + log2(1 + sightingCount) + 2 * avgCuriosity — sightings alone already lift
 * a node above the "just created" baseline of 1, and repeated curiosity signals lift it further. */
function computeEngagement(sightingCount: number, avgCuriosity: number): number {
  return 1 + Math.log2(1 + sightingCount) + 2 * avgCuriosity;
}

/** Memoized per nodes array identity: without this, every palace mount produced a fresh
 * assignment object, cachedWorldModel missed every time, and the expensive world rebuild
 * blocked the main thread on each open. Freshness rides on the same signal the world cache
 * uses — a reloaded tree is a new nodes array. A null (failed) load is not kept, so the
 * next open retries; caching the promise also dedupes StrictMode's double effect run. */
const assignmentCache = new WeakMap<
  readonly KnowledgeNodeRow[],
  Promise<ContinentAssignment | null>
>();

export function loadContinentAssignment(
  nodes: readonly KnowledgeNodeRow[],
): Promise<ContinentAssignment | null> {
  const cached = assignmentCache.get(nodes);
  if (cached !== undefined) return cached;
  const loading = computeContinentAssignment(nodes).then((assignment) => {
    if (assignment === null) assignmentCache.delete(nodes);
    return assignment;
  });
  assignmentCache.set(nodes, loading);
  return loading;
}

async function computeContinentAssignment(
  nodes: readonly KnowledgeNodeRow[],
): Promise<ContinentAssignment | null> {
  try {
    const repos = await getRepos();
    const [embeddingRows, sightingRows, interestSignalRows] = await Promise.all([
      repos.nodeEmbeddings.listAll(),
      repos.nodeSightings.listAll(),
      repos.interestSignals.listAll(),
    ]);

    const embeddingByNodeId = new Map<string, readonly number[]>();
    for (const row of embeddingRows) {
      const vector = parseEmbeddingVector(row.vector_json);
      if (vector !== null) embeddingByNodeId.set(row.node_id, vector);
    }

    const sightingCountByNodeId = new Map<string, number>();
    for (const sighting of sightingRows) {
      sightingCountByNodeId.set(
        sighting.node_id,
        (sightingCountByNodeId.get(sighting.node_id) ?? 0) + 1,
      );
    }

    const curiositySumByNodeId = new Map<string, number>();
    const curiosityCountByNodeId = new Map<string, number>();
    for (const signal of interestSignalRows) {
      curiositySumByNodeId.set(
        signal.node_id,
        (curiositySumByNodeId.get(signal.node_id) ?? 0) + signal.curiosity,
      );
      curiosityCountByNodeId.set(
        signal.node_id,
        (curiosityCountByNodeId.get(signal.node_id) ?? 0) + 1,
      );
    }

    const engagementByNodeId = new Map<string, number>();
    for (const node of nodes) {
      const sightingCount = sightingCountByNodeId.get(node.id) ?? 0;
      const curiosityCount = curiosityCountByNodeId.get(node.id) ?? 0;
      const avgCuriosity =
        curiosityCount > 0 ? (curiositySumByNodeId.get(node.id) ?? 0) / curiosityCount : 0;
      engagementByNodeId.set(node.id, computeEngagement(sightingCount, avgCuriosity));
    }

    return deriveContinents(nodes, embeddingByNodeId, engagementByNodeId);
  } catch (error) {
    console.warn("loadContinentAssignment failed, falling back to tree-root islands", error);
    return null;
  }
}
