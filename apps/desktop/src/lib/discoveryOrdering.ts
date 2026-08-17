/**
 * Purpose: pure display-ordering logic for the discovery feed's card grid (spec 051 §4, spec
 * 053 §4) — folds the event stream into interest weights, builds positive/negative embedding
 * centroids from the candidate cards themselves, adds each item's own features (crowd signal,
 * a real cover, freshness, the quality check's demotion), reranks with topic/channel/form
 * quotas, and hands a guaranteed share of the positions to topics the reader has no history
 * with. A card with no embedding yet is ranked on everything else at a neutral similarity
 * rather than pushed to the end: showing never waits on embedding (spec 053 §3).
 * No DB, no I/O.
 * Main exports: orderCardsForDisplay, discoveryRowsToInterestEvents.
 */
import type { DiscoveryCardRow, DiscoveryEventKind, DiscoveryEventRow } from "@breadcrumb/core-db";
import {
  computeCentroid,
  contentFeatureAdjustment,
  defaultExplorationShare,
  foldInterestFromEvents,
  type InterestEvent,
  interleaveExploration,
  type MmrCandidate,
  mmrSelect,
  scoreByCentroids,
} from "@breadcrumb/plugin-discovery";

/** Every recorded kind except 'dial': moving the feed's familiar/new switch says nothing about
 * the topic of the card it happened to be over. The rest — including saves, finishes and the
 * first-run stances — all carry interest and are weighted by the interest model. */
const NON_INTEREST_EVENT_KINDS: readonly DiscoveryEventKind[] = ["dial"];

function isInterestEventKind(kind: DiscoveryEventKind): kind is InterestEvent["kind"] {
  return !NON_INTEREST_EVENT_KINDS.includes(kind);
}

export function discoveryRowsToInterestEvents(rows: readonly DiscoveryEventRow[]): InterestEvent[] {
  const events: InterestEvent[] = [];
  for (const row of rows) {
    if (!isInterestEventKind(row.kind)) continue;
    events.push({
      topicLabel: row.topic_label,
      kind: row.kind,
      valueMs: row.value_ms,
      createdAt: row.created_at,
    });
  }
  return events;
}

function parseEmbedding(embeddingJson: string | null): number[] | null {
  if (embeddingJson === null) return null;
  try {
    const parsed: unknown = JSON.parse(embeddingJson);
    return Array.isArray(parsed) ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}

/** Weighted mean of `cards` embeddings, keyed off each card's own topic weight — cards from
 * a positive-weighted topic vote for the "what the user likes" centroid, negative-weighted
 * topics vote for the "what to avoid" one. Null when no card contributes (no evidence yet for
 * that side), which scoreByCentroids treats as a neutral zero contribution rather than a
 * zero vector. */
function buildCentroid(
  embeddedCards: readonly { card: DiscoveryCardRow; embedding: number[] }[],
  weightByTopic: ReadonlyMap<string, number>,
  side: "positive" | "negative",
): number[] | null {
  const contributors = embeddedCards
    .map(({ card, embedding }) => ({ embedding, weight: weightByTopic.get(card.topic_label) ?? 0 }))
    .filter(({ weight }) => (side === "positive" ? weight > 0 : weight < 0));
  if (contributors.length === 0) return null;
  return computeCentroid(
    contributors.map((c) => c.embedding),
    contributors.map((c) => Math.abs(c.weight)),
  );
}

/** A card whose vector has not been computed yet is neither close to nor far from what the
 * reader likes; treating it as either would be a guess. */
const NEUTRAL_SIMILARITY = 0;

export interface OrderingOptions {
  /** Share of the positions reserved for topics with no history — the feed's dial (spec 053
   * §6). Defaults to the plugin's own default. */
  explorationShare?: number;
}

/** Orders one page's worth of candidate cards for the grid. `events` is the full silent
 * signal history (foldInterestFromEvents does its own decay), not scoped to these cards. */
export function orderCardsForDisplay(
  cards: readonly DiscoveryCardRow[],
  events: readonly DiscoveryEventRow[],
  nowIso: string,
  options: OrderingOptions = {},
): DiscoveryCardRow[] {
  // A dislike is permanent: the card never re-enters the feed, this session or any later one.
  const dislikedIds = new Set(
    events.filter((event) => event.kind === "dislike").map((event) => event.card_id),
  );
  const live = cards
    .filter((card) => !dislikedIds.has(card.id))
    .map((card) => ({ card, embedding: parseEmbedding(card.embedding_json) }));
  if (live.length === 0) return [];

  const weights = foldInterestFromEvents(discoveryRowsToInterestEvents(events), nowIso);
  const weightByTopic = new Map(weights.map((w) => [w.topicLabel, w.weight]));
  const embedded = live.filter(
    (entry): entry is { card: DiscoveryCardRow; embedding: number[] } => entry.embedding !== null,
  );
  const positiveCentroid = buildCentroid(embedded, weightByTopic, "positive");
  const negativeCentroid = buildCentroid(embedded, weightByTopic, "negative");

  const candidates: MmrCandidate<DiscoveryCardRow>[] = live.map(({ card, embedding }) => ({
    item: card,
    score:
      (embedding === null
        ? NEUTRAL_SIMILARITY
        : scoreByCentroids(embedding, positiveCentroid, negativeCentroid)) +
      contentFeatureAdjustment(
        {
          upstreamSignal: card.upstream_signal,
          hasCover: card.cover_url !== null,
          publishedAt: card.published_at,
          qualityScore: card.quality_score,
        },
        nowIso,
      ),
    embedding,
    topicLabel: card.topic_label,
    sourceId: card.source_id,
    contentKind: card.kind,
  }));
  const ranked = mmrSelect(candidates, candidates.length);

  // Topics the reader has never accumulated a weight on are the unfamiliar ones; the dial
  // decides how much of the page they get, so a feed can never close in on itself.
  const familiar = ranked.filter((card) => weightByTopic.has(card.topic_label));
  const unfamiliar = ranked.filter((card) => !weightByTopic.has(card.topic_label));
  return interleaveExploration(
    familiar,
    unfamiliar,
    options.explorationShare ?? defaultExplorationShare,
  );
}
