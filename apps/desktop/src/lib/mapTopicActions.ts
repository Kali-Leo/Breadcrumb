/**
 * Purpose: loads everything discoverTopics needs from local SQLite — embeddings, sighting
 * counts, and average curiosity — and turns it into a TopicAssignment for the memory palace.
 * Best-effort: any failure (DB not ready, malformed embedding rows) degrades to null so the
 * caller falls back to tree-root islands instead of throwing.
 * Main exports: loadTopicAssignment.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { discoverTopics, type TopicAssignment } from "@breadcrumb/plugin-map";
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

export async function loadTopicAssignment(
  nodes: readonly KnowledgeNodeRow[],
): Promise<TopicAssignment | null> {
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

    return discoverTopics(nodes, embeddingByNodeId, engagementByNodeId);
  } catch (error) {
    console.warn("loadTopicAssignment failed, falling back to tree-root islands", error);
    return null;
  }
}
