/**
 * Purpose: pure display-ordering logic for the discovery feed's card grid (spec 051 §4) —
 * folds the event stream into interest weights, builds positive/negative embedding centroids
 * from the candidate cards themselves, scores+MMR-reranks the embedded ones, and appends
 * cards with no embedding yet (a fresh batch whose fastembed pass hasn't landed) by recency.
 * No DB, no I/O.
 * Main exports: orderCardsForDisplay, discoveryRowsToInterestEvents.
 */
import type { DiscoveryCardRow, DiscoveryEventKind, DiscoveryEventRow } from "@breadcrumb/core-db";
import {
  computeCentroid,
  foldInterestFromEvents,
  type InterestEvent,
  type MmrCandidate,
  mmrSelect,
  scoreByCentroids,
} from "@breadcrumb/plugin-discovery";

/** The kinds the interest model weighs today. Spec 053 §6 records more kinds (save/unsave/
 * finish/dial/onboarding); spec 053 T4 folds them into interest weighting, until then they are
 * stored but skipped here rather than guessed at a contribution. */
const INTEREST_EVENT_KINDS: readonly InterestEvent["kind"][] = [
  "impression",
  "open",
  "dwell",
  "dislike",
];

function isInterestEventKind(kind: DiscoveryEventKind): kind is InterestEvent["kind"] {
  return (INTEREST_EVENT_KINDS as readonly string[]).includes(kind);
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

function byRecencyDescending(a: DiscoveryCardRow, b: DiscoveryCardRow): number {
  return b.created_at.localeCompare(a.created_at);
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

/** Orders one page's worth of candidate cards for the grid. `events` is the full silent
 * signal history (foldInterestFromEvents does its own decay), not scoped to these cards. */
export function orderCardsForDisplay(
  cards: readonly DiscoveryCardRow[],
  events: readonly DiscoveryEventRow[],
  nowIso: string,
): DiscoveryCardRow[] {
  // A dislike is permanent: the card never re-enters the feed, this session or any later one.
  const dislikedIds = new Set(
    events.filter((event) => event.kind === "dislike").map((event) => event.card_id),
  );
  const embedded: { card: DiscoveryCardRow; embedding: number[] }[] = [];
  const unembedded: DiscoveryCardRow[] = [];
  for (const card of cards) {
    if (dislikedIds.has(card.id)) continue;
    const embedding = parseEmbedding(card.embedding_json);
    if (embedding === null) unembedded.push(card);
    else embedded.push({ card, embedding });
  }
  unembedded.sort(byRecencyDescending);

  if (embedded.length === 0) return unembedded;

  const weights = foldInterestFromEvents(discoveryRowsToInterestEvents(events), nowIso);
  const weightByTopic = new Map(weights.map((w) => [w.topicLabel, w.weight]));
  const positiveCentroid = buildCentroid(embedded, weightByTopic, "positive");
  const negativeCentroid = buildCentroid(embedded, weightByTopic, "negative");

  const candidates: MmrCandidate<DiscoveryCardRow>[] = embedded.map(({ card, embedding }) => ({
    item: card,
    score: scoreByCentroids(embedding, positiveCentroid, negativeCentroid),
    embedding,
    topicLabel: card.topic_label,
  }));
  const ranked = mmrSelect(candidates, embedded.length);

  return [...ranked, ...unembedded];
}
