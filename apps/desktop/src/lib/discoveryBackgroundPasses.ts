/**
 * Purpose: the work that happens behind cards that are already on screen (spec 053 §3's
 * display-first, embed-later rule) — the quality check over whatever in the pool is still unrated,
 * the embedding pass over whatever still has no vector, and the cover pass that goes looking for
 * the picture a feed did not ship. None of them is allowed to hold a card back: a card is readable
 * the moment it lands, and these only shape how the NEXT ordering and the next screenful come out.
 * Side effects: at most one LLM call per run (metered, switchable), local embedding calls,
 * budgeted page reads, and card updates.
 * Main exports: scoreQualityBacklog, embedPoolBacklog, runBackgroundPasses.
 */
import { QUALITY_CHECK_BATCH_CAP } from "@breadcrumb/plugin-discovery";
import { getRepos } from "./db";
import { enrichMissingCovers } from "./discoveryCoverEnrichment";
import { scoreBatchQuality } from "./discoveryQualityCheck";
import { embedTexts } from "./embeddings";
import { recordAiFailure } from "./failureLog";

/** One embedding pass covers roughly a restock's worth of cards; the rest are picked up by the
 * next pass rather than held in one long call. */
const EMBEDDING_BACKLOG_LIMIT = 60;

/**
 * Rates the pooled cards nobody has rated yet, newest first, and writes the scores down. It works
 * from the pool's backlog rather than from the batch that just landed because the check is not
 * always available when a batch lands: the app's first restock runs seconds after launch, before
 * anyone could have typed an API key in, and scoreBatchQuality answers "no config" with an empty
 * map and no call at all (spec 053 T10b — a fresh install's first hundred cards stayed unrated
 * for the life of the pool). Reading the backlog means the first pass that runs with a key drains
 * what earlier passes could not do, a batch's worth at a time.
 *
 * Unrated cards stay unrated in the meantime — the ranking treats that as neutral, never as bad
 * (spec 053 §5) — and one pass is still exactly one call: the limit is the prompt's own batch cap.
 */
export async function scoreQualityBacklog(limit = QUALITY_CHECK_BATCH_CAP): Promise<void> {
  try {
    const repos = await getRepos();
    const unrated = await repos.discovery.listCardsMissingQualityScore(limit);
    if (unrated.length === 0) return;
    const scores = await scoreBatchQuality(
      unrated.map((row) => ({ id: row.id, title: row.title, summary: row.hook })),
      null,
    );
    for (const [cardId, score] of scores) {
      await repos.discovery.setCardQualityScore(cardId, score);
    }
  } catch (error) {
    await recordAiFailure("discovery", error);
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
 * already in the pool and already readable. Every one of them reads the pool for itself, so a run
 * that landed nothing new still has work to do — which is what a launch onto an already stocked
 * pool looks like. The cover pass runs last because it is the only one that goes out to a page the
 * reader might never open — and a cover it finds lands on the row, so the next time the grid stages
 * a page out of the pool it draws the picture (a card already on screen keeps the face it was drawn
 * with until the next launch, which is nobody's problem).
 */
export async function runBackgroundPasses(): Promise<void> {
  await scoreQualityBacklog();
  await embedPoolBacklog();
  await enrichMissingCovers();
}
