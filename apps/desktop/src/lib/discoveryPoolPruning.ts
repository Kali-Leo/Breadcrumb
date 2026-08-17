/**
 * Purpose: spec 053 §3's two limits on the local candidate pool — 旧未看候选按时限淘汰 and a pool
 * that stays near its target size. Neither existed before (spec 053 T9 finding #5): nothing ever
 * deleted a card, so a year of ordinary use would leave tens of thousands of rows, every one of
 * them read on every restock. Runs after each restock lands, so the pruning cost is paid where
 * the reader is already waiting on nothing.
 * Side effects: deletes untouched pooled cards.
 * Main exports: UNSEEN_POOL_CAP, UNSEEN_POOL_MAX_AGE_DAYS, pruneDiscoveryPool.
 */
import { getRepos } from "./db";

/**
 * The most untouched candidates the pool ever holds. Five hundred is about two weeks of a busy
 * catalog, several days of reading offline, and one ranking pass that still runs in milliseconds.
 * Cards the reader opened or saved are outside this count entirely — those are theirs to keep.
 */
export const UNSEEN_POOL_CAP = 500;

/** How long an untouched candidate is worth keeping. Two weeks is longer than any offline
 * stretch the spec asks the pool to survive, and past it a candidate is stale enough that
 * showing it would be worse than showing nothing. */
export const UNSEEN_POOL_MAX_AGE_DAYS = 14;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Expires what has gone stale, then trims whatever is still over the cap, oldest publication
 * first. Nothing the reader opened or saved is ever deleted, and a card they said 不感兴趣 to
 * leaves its event behind when it goes, so the topic keeps what it taught the ranking.
 */
export async function pruneDiscoveryPool(now: Date): Promise<void> {
  const repos = await getRepos();
  const cutoff = new Date(now.getTime() - UNSEEN_POOL_MAX_AGE_DAYS * MILLISECONDS_PER_DAY);
  await repos.discovery.deleteUnseenCardsLandedBefore(cutoff.toISOString());
  await repos.discovery.trimUnseenPoolTo(UNSEEN_POOL_CAP);
}
