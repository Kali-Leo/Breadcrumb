/**
 * Purpose: spec 059 assembly — fetches the learner's watched professional content from the
 * local interest service, embeds the titles with the same local model the knowledge nodes
 * use, and hands plannerStore a per-node browsing-affinity map. Everything is best-effort:
 * an absent service or missing embedding model yields null and the planner runs exactly as
 * it did before spec 059. Titles stay in memory — never persisted, never sent to any LLM.
 * Main exports: loadBrowsingAffinityByNode.
 */
import type { NodeEmbeddingRow } from "@breadcrumb/core-db";
import {
  type BrowsingNodeAffinity,
  browsingAffinityByNode,
  createBrowsingInterestClient,
  type WatchedTitleVector,
  watchedTitleSignals,
} from "@breadcrumb/plugin-browsing-interest";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { embedTexts } from "./embeddings";

/** The service's read endpoints send no CORS headers, so requests must go through Rust. */
const client = createBrowsingInterestClient({
  fetch: (url, init) => tauriFetch(url, init),
});

/** Only this month's viewing drives recommendations (spec 059 — the recency half-life
 * makes anything older nearly weightless anyway, so fetching it would be waste). */
const PRO_CONTENT_DAYS = 30;

/** How long fetched-and-embedded title vectors stay fresh. Planner recomputes fire on every
 * mastery/interest/edge change; viewing history changes on a much slower clock. */
const TITLE_CACHE_MS = 30 * 60 * 1000;

/** After a failed attempt (service down, model missing), how long to not retry — the
 * client's own timeout is 8s, and paying it on every planner recompute would freeze the
 * pipeline behind a dead daemon. */
const FAILURE_CACHE_MS = 5 * 60 * 1000;

interface TitleVectorCache {
  vectors: readonly WatchedTitleVector[] | null;
  fetchedAt: number;
}

let cache: TitleVectorCache | null = null;

/** Watched-title vectors, through the cache: null means "unavailable right now" (service
 * unreachable, no embedding model, or simply nothing watched). */
async function cachedTitleVectors(): Promise<readonly WatchedTitleVector[] | null> {
  const now = Date.now();
  if (cache !== null) {
    const ttl = cache.vectors === null ? FAILURE_CACHE_MS : TITLE_CACHE_MS;
    if (now - cache.fetchedAt < ttl) return cache.vectors;
  }
  cache = { vectors: await fetchAndEmbedTitles(now), fetchedAt: now };
  return cache.vectors;
}

async function fetchAndEmbedTitles(nowMillis: number): Promise<WatchedTitleVector[] | null> {
  let signals: ReturnType<typeof watchedTitleSignals>;
  try {
    signals = watchedTitleSignals(await client.proContent(PRO_CONTENT_DAYS), nowMillis);
  } catch {
    return null; // absent service is the normal case for most users — stay silent
  }
  if (signals.length === 0) return null;
  const vectors = await embedTexts(signals.map((signal) => signal.title));
  if (vectors === null) return null; // embedding model not downloaded yet — same silence
  return signals.flatMap((signal, index) => {
    const vector = vectors[index];
    return vector === undefined ? [] : [{ ...signal, vector }];
  });
}

/** The per-node browsing affinity for the current knowledge tree, or null when browsing
 * data is unavailable — the caller passes the map straight into computePlannerSnapshot. */
export async function loadBrowsingAffinityByNode(
  embeddings: readonly NodeEmbeddingRow[],
): Promise<Map<string, BrowsingNodeAffinity> | null> {
  const titleVectors = await cachedTitleVectors();
  if (titleVectors === null || titleVectors.length === 0) return null;
  const nodeVectors = new Map<string, readonly number[]>(
    embeddings.map((row) => [row.node_id, JSON.parse(row.vector_json) as number[]]),
  );
  return browsingAffinityByNode(titleVectors, nodeVectors);
}
