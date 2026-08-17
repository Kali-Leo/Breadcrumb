/**
 * Purpose: the work that happens behind cards that are already on screen (spec 053 §3's
 * display-first, embed-later rule) — the batch quality check over what just landed, the embedding
 * pass over whatever in the pool still has no vector, and the cover pass that goes looking for the
 * picture a feed did not ship. None of them is allowed to hold a card back: a card is readable the
 * moment it lands, and these only shape how the NEXT ordering and the next screenful come out.
 * Side effects: one LLM call per landed batch (metered, switchable), local embedding calls,
 * budgeted page reads, and card updates.
 * Main exports: scoreLandedBatch, embedPoolBacklog, runBackgroundPasses.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { getRepos } from "./db";
import { enrichMissingCovers } from "./discoveryCoverEnrichment";
import { scoreBatchQuality } from "./discoveryQualityCheck";
import { embedTexts } from "./embeddings";
import { recordAiFailure } from "./failureLog";

/** One embedding pass covers roughly a restock's worth of cards; the rest are picked up by the
 * next pass rather than held in one long call. */
const EMBEDDING_BACKLOG_LIMIT = 60;

/** Rates the cards that just landed and writes the scores down. Unrated cards stay unrated —
 * the ranking treats that as neutral, never as bad (spec 053 §5). */
export async function scoreLandedBatch(rows: readonly DiscoveryCardRow[]): Promise<void> {
  const unrated = rows.filter((row) => row.quality_score === null);
  if (unrated.length === 0) return;
  const scores = await scoreBatchQuality(
    unrated.map((row) => ({ id: row.id, title: row.title, summary: row.hook })),
    null,
  );
  if (scores.size === 0) return;
  const repos = await getRepos();
  for (const [cardId, score] of scores) {
    await repos.discovery.setCardQualityScore(cardId, score);
  }
}

/**
 * Embeds pooled cards that have no vector yet — this run's landings and anything an earlier run
 * missed. Failures are swallowed: a card with no vector is ranked on its own features and its
 * recency, which is a slightly worse ordering, never a missing card.
 */
export async function embedPoolBacklog(limit = EMBEDDING_BACKLOG_LIMIT): Promise<void> {
  try {
    const repos = await getRepos();
    const pending = await repos.discovery.listCardsMissingEmbedding(limit);
    if (pending.length === 0) return;
    const vectors = await embedTexts(pending.map((row) => `${row.title}：${row.hook}`));
    if (vectors === null) return;
    for (let index = 0; index < pending.length; index += 1) {
      const row = pending[index];
      const vector = vectors[index];
      if (row === undefined || vector === undefined) continue;
      await repos.discovery.setCardEmbedding(row.id, JSON.stringify(vector));
    }
  } catch (error) {
    await recordAiFailure("discovery", error);
  }
}

/**
 * All three passes, in the order that matters least to the reader: whatever fails, the cards are
 * already in the pool and already readable. The cover pass runs last because it is the only one
 * that goes out to a page the reader might never open — and a cover it finds lands on the row, so
 * the next time the grid stages a page out of the pool it draws the picture (a card already on
 * screen keeps the face it was drawn with until the next launch, which is nobody's problem).
 */
export async function runBackgroundPasses(rows: readonly DiscoveryCardRow[]): Promise<void> {
  await scoreLandedBatch(rows);
  await embedPoolBacklog();
  await enrichMissingCovers();
}
