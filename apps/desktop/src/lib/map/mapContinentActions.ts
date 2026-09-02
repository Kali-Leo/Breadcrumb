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
import { parseVectorRows } from "@breadcrumb/core-db";
import { type ContinentAssignment, deriveContinents } from "@breadcrumb/feature-map";
import { getRepos } from "../platform/db";
import { rowsBeforeDay, startOfLocalDayIso } from "./layoutDay";

/** engagement = 1 + log2(1 + sightingCount) + 2 * avgCuriosity — sightings alone already lift
 * a node above the "just created" baseline of 1, and repeated curiosity signals lift it further. */
function computeEngagement(sightingCount: number, avgCuriosity: number): number {
  return 1 + Math.log2(1 + sightingCount) + 2 * avgCuriosity;
}

/** Memoized per nodes array identity: without this, every palace mount produced a fresh
 * assignment object, cachedWorldModel missed every time, and the expensive world rebuild
 * blocked the main thread on each open. Freshness rides on the same signal the world cache
 * uses — a reloaded tree is a new nodes array — plus the layout day, so a session crossing
 * midnight picks up the daily refresh. A null (failed) load is not kept, so the next open
 * retries; caching the promise also dedupes StrictMode's double effect run. */
const assignmentCache = new WeakMap<
  readonly KnowledgeNodeRow[],
  { dayStartIso: string; loading: Promise<ContinentAssignment | null> }
>();

export function loadContinentAssignment(
  nodes: readonly KnowledgeNodeRow[],
): Promise<ContinentAssignment | null> {
  const dayStartIso = startOfLocalDayIso();
  const cached = assignmentCache.get(nodes);
  if (cached !== undefined && cached.dayStartIso === dayStartIso) return cached.loading;
  const loading = computeContinentAssignment(nodes, dayStartIso).then((assignment) => {
    if (assignment === null) assignmentCache.delete(nodes);
    return assignment;
  });
  assignmentCache.set(nodes, { dayStartIso, loading });
  return loading;
}

async function computeContinentAssignment(
  nodes: readonly KnowledgeNodeRow[],
  dayStartIso: string,
): Promise<ContinentAssignment | null> {
  try {
    const repos = await getRepos();
    const [embeddingRows, allSightingRows, allInterestSignalRows] = await Promise.all([
      repos.nodeEmbeddings.listAll(),
      repos.nodeSightings.listAll(),
      repos.interestSignals.listAll(),
    ]);
    // Daily rhythm (Leo 2026-08-31): today's footprints don't reorder the map until tomorrow.
    const sightingRows = rowsBeforeDay(allSightingRows, dayStartIso);
    const interestSignalRows = rowsBeforeDay(allInterestSignalRows, dayStartIso);

    const embeddingByNodeId = parseVectorRows(embeddingRows, (row) => row.node_id);

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

    return deriveContinents(nodes, embeddingByNodeId, engagementByNodeId, dayStartIso);
  } catch (error) {
    console.warn("loadContinentAssignment failed, falling back to tree-root islands", error);
    return null;
  }
}
