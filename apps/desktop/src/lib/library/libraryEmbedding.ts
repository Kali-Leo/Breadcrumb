/**
 * Purpose: the background pass that fills in the vectors an import deliberately did not wait
 * for, and the one measurement that decides whether the reader is told their browser is the
 * slow part.
 *
 * It runs in batches and yields between them. This is not politeness: on a single WebAssembly
 * thread one passage costs hundreds of milliseconds, and a loop that did not yield would hold
 * the worker — and with it every search the reader tries meanwhile — for as long as the book
 * is long. Searching during the backfill is the point of the backfill being a backfill.
 *
 * Only one pass runs at a time, and starting it again while it is running is a no-op rather
 * than a second queue draining the same rows twice.
 * Main exports: runEmbeddingBackfill, readEmbeddingSpeed, EmbeddingProgressListener.
 */

import { withHeadingPath } from "@breadcrumb/core-ingest";
import { EMBEDDING_MODEL } from "@breadcrumb/core-vectors";
import { invoke } from "@tauri-apps/api/core";
import { getRepos } from "../platform/db";
import { embedTexts } from "../platform/embeddings";
import { nowIso } from "../platform/time";

/** Small enough that a search issued mid-backfill waits for one batch, not for the book. */
const BATCH = 16;

export interface EmbeddingProgress {
  embedded: number;
  total: number;
  /** Milliseconds per passage, as measured on the last batch. Null where nothing measured. */
  msPerText: number | null;
}

export type EmbeddingProgressListener = (progress: EmbeddingProgress) => void;

let running = false;

/**
 * How the last batch actually went, in the edition that can vary by four hundred times
 * depending on which browser is open. The desktop build has no such command and rejects,
 * which reads correctly as "nothing to say".
 */
export async function readEmbeddingSpeed(): Promise<number | null> {
  try {
    const speed = await invoke<{ msPerText: number } | null>("embedding_speed");
    return speed?.msPerText ?? null;
  } catch {
    return null;
  }
}

/**
 * Embeds every passage that has no vector from the model in use, oldest first, until there are
 * none left or a batch fails.
 *
 * A failed batch stops the pass instead of skipping past it. The failures that happen here are
 * "the model has not been downloaded" and "the network switch is off", which are conditions,
 * not bad rows: retrying the next batch would fail identically and burn the whole queue for
 * nothing. The pass runs again when the reader next opens the library.
 */
export async function runEmbeddingBackfill(notify?: EmbeddingProgressListener): Promise<void> {
  if (running) return;
  running = true;
  try {
    const repos = await getRepos();
    for (;;) {
      const pending = await repos.library.listPassagesMissingEmbedding(EMBEDDING_MODEL, BATCH);
      if (pending.length === 0) break;
      const vectors = await embedTexts(
        pending.map((passage) => withHeadingPath(passage.heading_path, passage.body)),
      );
      if (vectors === null) break;
      const createdAt = nowIso();
      for (let index = 0; index < pending.length; index += 1) {
        const passage = pending[index];
        const vector = vectors[index];
        if (passage === undefined || vector === undefined) continue;
        await repos.library.upsertPassageEmbedding({
          passage_id: passage.id,
          model: EMBEDDING_MODEL,
          vector_json: JSON.stringify(vector),
          created_at: createdAt,
        });
      }
      if (notify !== undefined) {
        const progress = await repos.library.embeddingProgress(EMBEDDING_MODEL);
        notify({ ...progress, msPerText: await readEmbeddingSpeed() });
      }
      // Back to the event loop, so a search typed during the backfill is answered now.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    running = false;
  }
}
