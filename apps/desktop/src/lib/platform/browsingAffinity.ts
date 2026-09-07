/**
 * Purpose: reads the learner's watched professional content out of this app's own browsing
 * table, embeds the titles with the same local model the knowledge nodes use, and hands
 * plannerStore a per-node browsing-affinity map. Everything is best-effort: no history yet or
 * a missing embedding model yields null and the planner runs exactly as if there were no
 * browsing signal at all. Titles stay in memory — never persisted, never sent to any LLM.
 * Main exports: loadBrowsingAffinityByNode.
 */
import type { NodeEmbeddingRow } from "@breadcrumb/core-db";
import { parseVectorRows } from "@breadcrumb/core-db";
import {
  browsingAffinityByNode,
  type WatchedTitleSignal,
  watchedTitleSignals,
} from "@breadcrumb/feature-browsing-interest";
import { readProContent } from "./browsingPanels";
import { embedTexts } from "./embeddings";

/** A watched title with everything downstream needs: the affinity path reads title/weight/
 * vector; hindsight validation additionally reads ts/finished to recompute
 * the weight as of a past moment. */
export type WatchedTitleRecord = WatchedTitleSignal & { vector: readonly number[] };

/** How long read-and-embedded title vectors stay fresh. Planner recomputes fire on every
 * mastery/interest/edge change; viewing history changes on a much slower clock. */
const TITLE_CACHE_MS = 30 * 60 * 1000;

/** After a failed attempt (unreadable table, embedding model missing), how long to not retry.
 * A planner recompute fires on every mastery/interest/edge change, and re-attempting a read
 * that just failed on each of them buys nothing. */
const FAILURE_CACHE_MS = 5 * 60 * 1000;

interface TitleVectorCache {
  vectors: readonly WatchedTitleRecord[] | null;
  fetchedAt: number;
}

let cache: TitleVectorCache | null = null;

/** Watched-title records, through the cache: null means "unavailable right now" (the table
 * could not be read, or the embedding model is not there). */
export async function loadWatchedTitleRecords(): Promise<readonly WatchedTitleRecord[] | null> {
  const now = Date.now();
  if (cache !== null) {
    const ttl = cache.vectors === null ? FAILURE_CACHE_MS : TITLE_CACHE_MS;
    if (now - cache.fetchedAt < ttl) return cache.vectors;
  }
  cache = { vectors: await readAndEmbedTitles(now), fetchedAt: now };
  return cache.vectors;
}

async function readAndEmbedTitles(nowMillis: number): Promise<WatchedTitleRecord[] | null> {
  // Breadcrumb's own table is the only source: the collector writes browsing straight into it
  // (lib/platform/browsingIntake), so this works in both editions and makes no request.
  let signals: ReturnType<typeof watchedTitleSignals>;
  try {
    signals = watchedTitleSignals(await readProContent(nowMillis / 1000), nowMillis);
  } catch {
    return null; // an unreadable table is a failure, not an empty history — retry sooner
  }
  // Empty viewing history is a stable answer, not a failure — cache it on the long TTL.
  if (signals.length === 0) return [];
  const vectors = await embedTexts(signals.map((signal) => signal.title));
  if (vectors === null) return null; // embedding model not downloaded yet — same silence
  return signals.flatMap((signal, index) => {
    const vector = vectors[index];
    return vector === undefined ? [] : [{ ...signal, vector }];
  });
}

/** Node embedding rows → id-keyed vectors. One corrupt vector row must cost that row, never
 * the whole caller — this is the promise that a broken bridge behaves as no bridge. */
export function parseNodeVectors(
  embeddings: readonly NodeEmbeddingRow[],
): Map<string, readonly number[]> {
  return parseVectorRows(embeddings, (row) => row.node_id);
}

/** The per-node browsing affinity for the current knowledge tree, or null when browsing
 * data is unavailable — the caller passes the map straight into computePlannerSnapshot. */
export async function loadBrowsingAffinityByNode(
  embeddings: readonly NodeEmbeddingRow[],
): Promise<Map<string, number> | null> {
  const titleVectors = await loadWatchedTitleRecords();
  if (titleVectors === null || titleVectors.length === 0) return null;
  return browsingAffinityByNode(titleVectors, parseNodeVectors(embeddings));
}
