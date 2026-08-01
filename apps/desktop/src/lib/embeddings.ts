/**
 * Purpose: TS bridge to the Rust `embed_texts` Tauri command (local fastembed) — embeds a
 * batch of knowledge nodes and writes them to node_embeddings. Side effect: DB writes.
 * Every failure is swallowed (console.warn): embeddings accelerate edge discovery, they are
 * never a hard dependency for chat or knowledge-tree extraction to keep working.
 * Main exports: embedNodes, backfillMissingEmbeddings.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { invoke } from "@tauri-apps/api/core";
import { getRepos } from "./db";
import { nowIso } from "./time";

const EMBEDDING_MODEL = "multilingual-e5-small";

/** Embeds every given node (label + summary) in one batched call and upserts the vectors.
 * No-op when the list is empty; silently skips the whole batch if the Rust command fails
 * (model not downloaded yet, offline first run, etc). */
export async function embedNodes(nodes: readonly KnowledgeNodeRow[]): Promise<void> {
  if (nodes.length === 0) return;
  try {
    const vectors = await invoke<number[][]>("embed_texts", {
      texts: nodes.map((node) => `${node.label}: ${node.summary}`),
    });
    const repos = await getRepos();
    const createdAt = nowIso();
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const vector = vectors[index];
      if (node === undefined || vector === undefined) continue;
      await repos.nodeEmbeddings.upsert({
        node_id: node.id,
        model: EMBEDDING_MODEL,
        vector_json: JSON.stringify(vector),
        created_at: createdAt,
      });
    }
  } catch (error) {
    console.warn("embedding skipped:", error);
  }
}

/** Startup catch-up: embeds every node that doesn't have a row in node_embeddings yet
 * (older nodes from before this feature landed, or nodes missed by a prior failure). */
export async function backfillMissingEmbeddings(): Promise<void> {
  const repos = await getRepos();
  const missing = await repos.nodeEmbeddings.listNodesMissingEmbedding();
  await embedNodes(missing);
}
