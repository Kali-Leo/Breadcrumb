/**
 * Purpose: spec 059 assembly — fetches the learner's watched professional content from the
 * local interest service, embeds the titles with the same local model the knowledge nodes
 * use, and hands plannerStore a per-node browsing-affinity map. Everything is best-effort:
 * an absent service or missing embedding model yields null and the planner runs exactly as
 * it did before spec 059. Titles stay in memory — never persisted, never sent to any LLM.
 * Main exports: loadBrowsingAffinityByNode.
 */
import type { NodeEmbeddingRow } from "@breadcrumb/core-db";
import { parseVectorRows } from "@breadcrumb/core-db";
import {
  browsingAffinityByNode,
  createBrowsingInterestClient,
  type WatchedTitleSignal,
  watchedTitleSignals,
} from "@breadcrumb/plugin-browsing-interest";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { embedTexts } from "./embeddings";

/** A watched title with everything downstream needs: the affinity path reads title/weight/
 * vector; hindsight validation (spec 060 §5) additionally reads ts/finished to recompute
 * the weight as of a past moment. */
export type WatchedTitleRecord = WatchedTitleSignal & { vector: readonly number[] };

/** The service's read endpoints send no CORS headers, so requests must go through Rust. */
const client = createBrowsingInterestClient({
  fetch: (url, init) => tauriFetch(url, init),
});

/** Fetch window for watched content. Three half-lives wide, so the window edge is where
 * weight has already decayed to ~0.125 — a fade, not a cliff. (A window equal to the
 * half-life would drop titles still carrying half their weight — 2026-08-30 review.) */
const PRO_CONTENT_DAYS = 90;

/** How long fetched-and-embedded title vectors stay fresh. Planner recomputes fire on every
 * mastery/interest/edge change; viewing history changes on a much slower clock. */
const TITLE_CACHE_MS = 30 * 60 * 1000;

/** After a failed attempt (service down, model missing), how long to not retry — the
 * client's own timeout is 8s, and paying it on every planner recompute would freeze the
 * pipeline behind a dead daemon. */
const FAILURE_CACHE_MS = 5 * 60 * 1000;

interface TitleVectorCache {
  vectors: readonly WatchedTitleRecord[] | null;
  fetchedAt: number;
}

let cache: TitleVectorCache | null = null;

/** Watched-title records, through the cache: null means "unavailable right now" (service
 * unreachable, no embedding model, or simply nothing watched). */
export async function loadWatchedTitleRecords(): Promise<readonly WatchedTitleRecord[] | null> {
  const now = Date.now();
  if (cache !== null) {
    const ttl = cache.vectors === null ? FAILURE_CACHE_MS : TITLE_CACHE_MS;
    if (now - cache.fetchedAt < ttl) return cache.vectors;
  }
  cache = { vectors: await fetchAndEmbedTitles(now), fetchedAt: now };
  return cache.vectors;
}

async function fetchAndEmbedTitles(nowMillis: number): Promise<WatchedTitleRecord[] | null> {
  let signals: ReturnType<typeof watchedTitleSignals>;
  try {
    signals = watchedTitleSignals(await client.proContent(PRO_CONTENT_DAYS), nowMillis);
  } catch {
    return null; // absent service is the normal case for most users — stay silent
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
 * the whole caller — this is the promise that a broken bridge behaves as no bridge (spec
 * 059 出错三问). */
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
