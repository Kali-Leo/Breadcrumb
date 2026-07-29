/**
 * Purpose: groups knowledge nodes into map "places" — union-find over node pairs whose
 * embedding similarity crosses a threshold. Related knowledge shares a place;
 * unrelated knowledge ends up across the sea.
 * Main exports: clusterNodes, SIMILARITY_THRESHOLD.
 */
import { cosineSimilarity } from "./similarity";

/** E5-family cosine similarities are high-baseline; tuned empirically, adjust with data. */
export const SIMILARITY_THRESHOLD = 0.86;

export interface EmbeddedNode {
  nodeId: string;
  vector: readonly number[];
}

/** Returns clusters as arrays of nodeIds, deterministic for identical input order. */
export function clusterNodes(
  nodes: readonly EmbeddedNode[],
  threshold: number = SIMILARITY_THRESHOLD,
): string[][] {
  const parent = new Map<string, string>(nodes.map((node) => [node.nodeId, node.nodeId]));

  function findRoot(id: string): string {
    let root = id;
    while (parent.get(root) !== root) {
      root = parent.get(root) ?? root;
    }
    parent.set(id, root);
    return root;
  }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (!a || !b) continue;
      if (cosineSimilarity(a.vector, b.vector) >= threshold) {
        parent.set(findRoot(b.nodeId), findRoot(a.nodeId));
      }
    }
  }

  const clusters = new Map<string, string[]>();
  for (const node of nodes) {
    const root = findRoot(node.nodeId);
    const members = clusters.get(root) ?? [];
    members.push(node.nodeId);
    clusters.set(root, members);
  }
  return [...clusters.values()];
}
