/**
 * Purpose: TS bridge to the Rust `embed_texts` Tauri command (local fastembed) — a low-level
 * text-embedding helper (embedTexts) plus a batched knowledge-node embedder that writes
 * straight to node_embeddings (embedNodes). Side effect: DB writes (embedNodes only).
 * Every failure is swallowed (degradeSilently): embeddings accelerate edge/synonym discovery,
 * they are never a hard dependency for chat or knowledge-tree extraction to keep working.
 * Main exports: embedTexts, embedNodes, backfillMissingEmbeddings.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../../stores/settingsStore";
import { getRepos } from "./db";
import { isBrowserEdition } from "./edition";
import { degradeSilently } from "./failureLog";
import { nowIso } from "./time";

/** What each row in node_embeddings is stamped with. The browser edition runs the same model
 * quantised to q8 (apps/web/src/shims/embeddings.ts, BROWSER_EMBEDDING_MODEL), whose vectors
 * agree with these only to a cosine of ~0.995; the suffix lets an exported library say which
 * precision made each row instead of mixing the two under one name. */
const EMBEDDING_MODEL = isBrowserEdition() ? "multilingual-e5-small-q8" : "multilingual-e5-small";
/** Mirrors MAX_TEXTS_PER_CALL in src-tauri/src/embeddings.rs. One oversized call is refused
 * whole, and the 2026-09-02 walkthrough found the canonical-concept cache (1,012 texts) had
 * never filled because of it — so the bridge slices here and every caller stays batch-safe. */
const MAX_TEXTS_PER_CALL = 512;

/** Embeds a batch of raw texts via the local Rust command. Returns null on any failure
 * (model not downloaded yet, offline first run, etc) instead of throwing — callers decide
 * how to degrade (e.g. spec 015's synonym gate skips itself entirely). */
export async function embedTexts(texts: readonly string[]): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  try {
    // The model download is the one network request this feature makes; after that it runs
    // offline. Passing the switch through means a user who turned the network off does not
    // get a silent fetch from a third party they never configured, while an already-cached
    // model keeps working offline as it should.
    const allowDownload = useSettingsStore.getState().networkEnabled;
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += MAX_TEXTS_PER_CALL) {
      const batch = await invoke<number[][]>("embed_texts", {
        texts: texts.slice(start, start + MAX_TEXTS_PER_CALL),
        allowDownload,
      });
      vectors.push(...batch);
    }
    return vectors;
  } catch (error) {
    void degradeSilently("embeddings", error);
    return null;
  }
}

/** Embeds every given node (label + summary) in one batched call and upserts the vectors.
 * No-op when the list is empty; silently skips the whole batch if the Rust command fails. */
export async function embedNodes(nodes: readonly KnowledgeNodeRow[]): Promise<void> {
  if (nodes.length === 0) return;
  const vectors = await embedTexts(nodes.map((node) => `${node.label}: ${node.summary}`));
  if (vectors === null) return;
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
}

/** Startup catch-up: embeds every node that doesn't have a row in node_embeddings yet
 * (older nodes from before this feature landed, or nodes missed by a prior failure). */
export async function backfillMissingEmbeddings(): Promise<void> {
  const repos = await getRepos();
  const missing = await repos.nodeEmbeddings.listNodesMissingEmbedding();
  await embedNodes(missing);
}
