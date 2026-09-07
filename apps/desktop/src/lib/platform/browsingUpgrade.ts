/**
 * Purpose: layer B, in the background. The n-gram classifier answers the moment an event
 * arrives (./browsingIntake); this comes back later, when the embedding model is actually
 * available, re-classifies the rows it wrote, and replaces its answers with better ones.
 *
 * It is allowed to fail at any point and always is allowed to fail silently. The embedding
 * model is a 113 MB download that may never have happened, the network switch may be off, and
 * a worker may simply refuse — in every one of those cases `embedTexts` returns null, this
 * stops, and the n-gram answers already in the rows stay exactly as valid as they were. The
 * page is never blocked on this and never mentions it.
 *
 * The text embedded is `title + " " + author`, which is what the coefficients were fitted on
 * (scripts/interest-model/train_classifiers.py). The "query: " prefix E5 needs is added by the
 * embedder itself on both editions, so it must not be added here as well.
 * Main exports: upgradeBrowsingClassifications.
 */
import type { BrowsingEventClassificationUpdate } from "@breadcrumb/core-db";
import {
  classificationOf,
  classifyVectors,
  needsEmbeddingUpgrade,
  resolveClassification,
  topicProbabilities,
} from "@breadcrumb/feature-browsing-interest";
import { getRepos } from "./db";
import { embedTexts } from "./embeddings";
import { degradeSilently } from "./failureLog";

/** Rows per pass. One embedding is on the order of a hundred milliseconds, so this is a few
 * tens of seconds of background work — long enough to make progress on a real backlog, short
 * enough that closing the page does not throw away much. */
const BATCH_SIZE = 200;

/**
 * One pass of the upgrade. Returns how many rows it improved, which is 0 for every reason
 * that is not an error: nothing pending, no embedder, or the embedder gave back something the
 * classifier heads could not use.
 */
export async function upgradeBrowsingClassifications(): Promise<number> {
  try {
    const repos = await getRepos();
    const pending = await repos.browsingEventUpgrades.listNeedingUpgrade(BATCH_SIZE);
    if (pending.length === 0) return 0;
    const vectors = await embedTexts(pending.map((row) => `${row.title} ${row.up}`));
    // Null is "not right now", not "these have no topics": the rows keep what they have and
    // are offered again on the next pass.
    if (vectors === null || vectors.length !== pending.length) return 0;
    const classified = classifyVectors(vectors);
    const updates: BrowsingEventClassificationUpdate[] = [];
    for (let index = 0; index < pending.length; index += 1) {
      const row = pending[index];
      const embedding = classified[index];
      // A vector the heads could not score comes back as null; that row keeps what it has.
      if (row === undefined || embedding === undefined || embedding === null) continue;
      // Asked per row rather than once for the batch: a row a better classifier has already
      // been over must not be walked back, even if it turned up in the same query.
      if (!needsEmbeddingUpgrade(row.classifier, true)) continue;
      const update = resolvedUpdate(row, embedding);
      if (update !== null) updates.push(update);
    }
    await repos.browsingEventUpgrades.applyClassifications(updates);
    return updates.length;
  } catch (error) {
    void degradeSilently("browsing-classifier-upgrade", error);
    return 0;
  }
}

/** Both layers, resolved head by head, turned into the four columns a row carries. */
function resolvedUpdate(
  row: { rowid: number; title: string; up: string },
  embedding: { topicProbabilities: readonly number[]; emotionProbabilities: readonly number[] },
): BrowsingEventClassificationUpdate | null {
  const resolved = resolveClassification({
    ngram: { topicProbabilities: topicProbabilities(row.title, row.up) },
    embedding,
    embeddingAvailable: true,
  });
  if (resolved === null) return null;
  const { topic, emo, valence } = classificationOf(resolved);
  return { rowid: row.rowid, topic, emo, valence, classifier: resolved.classifier };
}
