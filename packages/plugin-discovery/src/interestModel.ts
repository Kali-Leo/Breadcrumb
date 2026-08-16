/**
 * Purpose: folds the discovery feed's silent event stream (impression/open/dwell/dislike)
 * into per-topic interest weights and per-topic open/dislike counts. Contribution recipe
 * after Nunti's keyword-weight table (method only, no code copied — Nunti is GPL) with an
 * added exponential time decay; pure math, no DB, no I/O.
 * Main exports: DiscoveryEventKind, InterestEvent, TopicWeight, TopicStats,
 * foldInterestFromEvents, topicStatsFromEvents.
 */

export type DiscoveryEventKind = "impression" | "open" | "dwell" | "dislike";

/** A plain domain event, decoupled from the DB row shape — callers map DiscoveryEventRow into
 * this before folding, keeping this package independent of core-db's column naming. */
export interface InterestEvent {
  topicLabel: string;
  kind: DiscoveryEventKind;
  /** Reading duration in milliseconds; only meaningful for kind='dwell', null otherwise. */
  valueMs: number | null;
  createdAt: string;
}

export interface TopicWeight {
  topicLabel: string;
  weight: number;
}

export interface TopicStats {
  topicLabel: string;
  opens: number;
  dislikes: number;
}

const MILLISECONDS_PER_WEEK = 1000 * 60 * 60 * 24 * 7;
const MILLISECONDS_PER_MINUTE = 60 * 1000;

/** Below this magnitude a topic's folded weight is noise, not signal — dropped rather than
 * shown as a near-zero preference. */
const WEIGHT_DROP_THRESHOLD = 0.05;

/** Per-event raw contribution, before time decay. Dwell scales with reading time, capped at
 * 2 minutes (further reading adds no extra confidence past that). */
function rawContribution(event: InterestEvent): number {
  switch (event.kind) {
    case "impression":
      return 0.05;
    case "open":
      return 1.0;
    case "dwell": {
      const minutes = Math.min((event.valueMs ?? 0) / MILLISECONDS_PER_MINUTE, 2);
      return minutes * 0.75;
    }
    case "dislike":
      return -2.5;
  }
}

/** Weekly half-life-style decay: a contribution is worth 0.9^weeks of its raw value. Events
 * from the future (clock skew) are treated as age zero rather than boosted. */
function decayFactor(nowMillis: number, createdAtIso: string): number {
  const ageWeeks = Math.max(0, (nowMillis - Date.parse(createdAtIso)) / MILLISECONDS_PER_WEEK);
  return 0.9 ** ageWeeks;
}

/** Sums decayed per-topic contributions across every event, drops near-zero topics, and
 * returns the rest sorted by weight descending — the feed's "what does this learner seem
 * interested in" signal (never surfaced to the user in these terms; see product principle 1
 * and the discovery spec's banned-mechanism-words list). */
export function foldInterestFromEvents(
  events: readonly InterestEvent[],
  nowIso: string,
): TopicWeight[] {
  const now = Date.parse(nowIso);
  const totalsByTopic = new Map<string, number>();

  for (const event of events) {
    const contribution = rawContribution(event) * decayFactor(now, event.createdAt);
    totalsByTopic.set(event.topicLabel, (totalsByTopic.get(event.topicLabel) ?? 0) + contribution);
  }

  return [...totalsByTopic.entries()]
    .map(([topicLabel, weight]) => ({ topicLabel, weight }))
    .filter((entry) => Math.abs(entry.weight) >= WEIGHT_DROP_THRESHOLD)
    .sort((a, b) => b.weight - a.weight);
}

/** Raw open/dislike counts per topic (no decay) — the Beta-distribution input for Thompson
 * sampling (thompson.ts), which needs counts, not a decayed continuous score. Every topic
 * that appears in any event (any kind) is included, so a topic with only impressions still
 * gets a neutral Beta(1,1) prior. */
export function topicStatsFromEvents(events: readonly InterestEvent[]): TopicStats[] {
  const statsByTopic = new Map<string, TopicStats>();
  for (const event of events) {
    const stats = statsByTopic.get(event.topicLabel) ?? {
      topicLabel: event.topicLabel,
      opens: 0,
      dislikes: 0,
    };
    if (event.kind === "open") stats.opens += 1;
    if (event.kind === "dislike") stats.dislikes += 1;
    statsByTopic.set(event.topicLabel, stats);
  }
  return [...statsByTopic.values()];
}
