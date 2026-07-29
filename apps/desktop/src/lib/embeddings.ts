/**
 * Purpose: embedding pipeline — sends node texts to the local Rust fastembed command and
 * stores vectors. Free (local compute) and quiet: failures (e.g. model not yet downloaded
 * while offline) leave nodes in the backfill queue for the next attempt.
 * Main exports: embedMissingNodes, EMBEDDING_MODEL_NAME.
 */
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../stores/settingsStore";
import { getRepos } from "./db";
import { nowIso } from "./time";

export const EMBEDDING_MODEL_NAME = "multilingual-e5-small";

let running = false;

/** Embeds every node still lacking a vector. Returns how many were embedded. */
export async function embedMissingNodes(): Promise<number> {
  if (running) return 0; // one pipeline at a time
  // Embedding is local, but the first run downloads the model — honor the network switch.
  if (!useSettingsStore.getState().networkEnabled) return 0;
  running = true;
  try {
    const repos = await getRepos();
    const missing = await repos.nodeEmbeddings.listNodesMissingEmbedding();
    if (missing.length === 0) return 0;

    const texts = missing.map((node) => `${node.label}：${node.summary}`);
    const vectors = await invoke<number[][]>("embed_texts", { texts });
    let stored = 0;
    for (let i = 0; i < missing.length; i++) {
      const node = missing[i];
      const vector = vectors[i];
      if (!node || !vector) continue;
      await repos.nodeEmbeddings.upsert({
        node_id: node.id,
        model: EMBEDDING_MODEL_NAME,
        vector_json: JSON.stringify(vector),
        created_at: nowIso(),
      });
      stored++;
    }
    return stored;
  } catch (error) {
    console.warn("embedding pipeline deferred:", error);
    return 0;
  } finally {
    running = false;
  }
}
