/**
 * Purpose: persists synthetic embeddings for a batch of knowledge nodes into node_embeddings —
 * the harness's stand-in for apps/desktop/src/lib/platform/embeddings.ts's embedNodes(). Deliberate
 * divergence: the app swallows embedding failures (best-effort, never blocks chat); the
 * harness lets them throw, since a broken embedding step here is a test signal, not a UX
 * degradation to hide.
 * Main exports: embedNodes.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { SimlabRepos } from "../db/repos";
import { computeSyntheticNodeEmbedding, SYNTHETIC_EMBEDDING_MODEL } from "./syntheticEmbedding";

export async function embedNodes(
  nodes: readonly KnowledgeNodeRow[],
  repos: SimlabRepos,
  nowIso: string,
): Promise<void> {
  for (const node of nodes) {
    const vector = computeSyntheticNodeEmbedding(node.label, node.summary);
    await repos.nodeEmbeddings.upsert({
      node_id: node.id,
      model: SYNTHETIC_EMBEDDING_MODEL,
      vector_json: JSON.stringify(vector),
      created_at: nowIso,
    });
  }
}
