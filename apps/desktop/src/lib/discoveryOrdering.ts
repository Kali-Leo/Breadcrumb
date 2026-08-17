/**
 * Purpose: pure display-ordering logic for the discovery feed's card grid (spec 051 §4, spec
 * 053 §4) — folds the event stream into interest weights, builds positive/negative embedding
 * centroids from the candidate cards themselves, weighs those against each item's own features
 * (crowd signal, a real cover, freshness, the quality check's demotion), and lays the result out
 * one page at a time under the topic/channel/form quotas, with a guaranteed share of every page
 * going to topics the reader has never acted on. A card with no embedding yet is ranked on
 * everything else at a neutral similarity rather than pushed to the end: showing never waits on
 * embedding (spec 053 §3). No DB, no I/O.
 * Main exports: orderCardsForDisplay, discoveryRowsToInterestEvents.
 */
import type { DiscoveryCardRow, DiscoveryEventKind, DiscoveryEventRow } from "@breadcrumb/core-db";
import {
  assembleFeedPages,
  classifyTopicsByEvidence,
  computeCentroid,
  contentFeatureParts,
  defaultExplorationShare,
  defaultFeedPageSize,
  establishedTopics,
  foldInterestFromEvents,
  type InterestEvent,
  type MmrCandidate,
  rankingScore,
  scoreByCentroids,
  topicAffinities,
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
  /** Share of the positions reserved for topics the reader has never acted on — the feed's dial
   * (spec 053 §6). Defaults to the plugin's own default. */
  explorationShare?: number;
  /** How many cards the grid shows at a time; the quotas are enforced inside each such page. */
  pageSize?: number;
}

/** Orders the candidate pool into the pages the grid will hand out. `events` is the full silent
 * signal history (foldInterestFromEvents does its own decay), not scoped to these cards. */
export function orderCardsForDisplay(
  cards: readonly DiscoveryCardRow[],
  events: readonly DiscoveryEventRow[],
  nowIso: string,
  options: OrderingOptions = {},
): DiscoveryCardRow[] {
  // A dislike is permanent: the card never re-enters the feed, this session or any later one.
  // Neither does one the reader already opened — that one is finished business, reachable
  // through 收藏 and the reading history, never again through the unseen grid.
  const dislikedIds = new Set(
    events.filter((event) => event.kind === "dislike").map((event) => event.card_id),
  );
  const live = cards
    .filter((card) => card.opened_at === null && !dislikedIds.has(card.id))
    .map((card) => ({ card, embedding: parseEmbedding(card.embedding_json) }));
  if (live.length === 0) return [];

  const interestEvents = discoveryRowsToInterestEvents(events);
  const weights = foldInterestFromEvents(interestEvents, nowIso);
  const weightByTopic = new Map(weights.map((w) => [w.topicLabel, w.weight]));
  const affinityByTopic = topicAffinities(weights);
  const embedded = live.filter(
    (entry): entry is { card: DiscoveryCardRow; embedding: number[] } => entry.embedding !== null,
  );
  const positiveCentroid = buildCentroid(embedded, weightByTopic, "positive");
  const negativeCentroid = buildCentroid(embedded, weightByTopic, "negative");

  const candidates: MmrCandidate<DiscoveryCardRow>[] = live.map(({ card, embedding }) => {
    const content = contentFeatureParts(
      {
        upstreamSignal: card.upstream_signal,
        hasCover: card.cover_url !== null,
        publishedAt: card.published_at,
        qualityScore: card.quality_score,
      },
      nowIso,
    );
    return {
      item: card,
      score: rankingScore({
        topicAffinity: affinityByTopic.get(card.topic_label) ?? 0,
        centroidScore:
          embedding === null
            ? NEUTRAL_SIMILARITY
            : scoreByCentroids(embedding, positiveCentroid, negativeCentroid),
        contentBonus: content.bonus,
        qualityDemotion: content.demotion,
      }),
      embedding,
      topicLabel: card.topic_label,
      sourceId: card.source_id,
      contentKind: card.kind,
    };
  });

  // Exploration material is every topic the reader has not made part of their reading: never
  // touched, touched once out of curiosity, or merely shown a great many times (spec 053 T9
  // finding #3 — being shown a card is not engaging with it, and the grid records an impression
  // for every card it shows). The topics they have refused are exploration material for nobody:
  // they stay in the ranked lane, where their own negative standing is what sinks them.
  const evidence = classifyTopicsByEvidence(interestEvents);
  const established = establishedTopics(affinityByTopic, evidence);
  const isFamiliar = (card: MmrCandidate<DiscoveryCardRow>): boolean =>
    established.has(card.topicLabel) || evidence.avoided.has(card.topicLabel);
  return assembleFeedPages(
    {
      familiar: candidates.filter(isFamiliar),
      unexplored: candidates.filter((card) => !isFamiliar(card)),
    },
    {
      pageSize: options.pageSize ?? defaultFeedPageSize,
      explorationShare: options.explorationShare ?? defaultExplorationShare,
    },
  );
}
