/**
 * Purpose: folds the discovery feed's silent event stream (impression/open/dwell/save/unsave/
 * finish/dislike, plus the first-run stances) into per-topic interest weights and per-topic
 * positive/negative counts. Contribution recipe after Nunti's keyword-weight table (method
 * only, no code copied — Nunti is GPL) with an added exponential time decay; pure math, no DB,
 * no I/O.
 * Main exports: DiscoveryEventKind, InterestEvent, TopicWeight, TopicStats,
 * foldInterestFromEvents, topicStatsFromEvents, TopicEvidence, classifyTopicsByEvidence.
 */

/**
 * Every kind that says something about interest. Spec 053 §6's zero-like architecture: all the
 * positives are self-interested actions the reader took for their own sake (they opened it,
 * they stayed, they kept it, they finished it), never a rating button. The feed's dial moves
 * (kind 'dial' in the DB) say nothing about a topic and are not part of this union.
 */
export type DiscoveryEventKind =
  | "impression"
  | "open"
  | "dwell"
  | "dislike"
  | "save"
  | "unsave"
  | "finish"
  | "onboarding";

/** A plain domain event, decoupled from the DB row shape — callers map DiscoveryEventRow into
 * this before folding, keeping this package independent of core-db's column naming. */
export interface InterestEvent {
  topicLabel: string;
  kind: DiscoveryEventKind;
  /** Reading duration in milliseconds for kind='dwell'; the first-run stance for
   * kind='onboarding' (positive = 想看, 0 = 一般, negative = 不想看); null otherwise. */
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

/** What one first-run stance is worth. Deliberately below a save: it is what the reader
 * guessed about themselves before seeing anything, and a week of real behaviour should be able
 * to overrule it (which the decay below makes happen on its own). */
const ONBOARDING_STANCE_CONTRIBUTION = 1.5;

/** Per-event raw contribution, before time decay. Dwell scales with reading time, capped at
 * 2 minutes (further reading adds no extra confidence past that). Saving outranks finishing
 * outranks opening because each one costs the reader more deliberate effort — and unsaving is
 * the exact mirror of saving, so taking something back leaves no lingering positive. */
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
    case "finish":
      return 2.0;
    case "save":
      return 2.5;
    case "unsave":
      return -2.5;
    case "dislike":
      return -2.5;
    case "onboarding":
      return Math.sign(event.valueMs ?? 0) * ONBOARDING_STANCE_CONTRIBUTION;
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

/** Whether an event counts as a success or a failure for the Beta posteriors below. Opening,
 * finishing and saving all count as one success each: they are separate acts, and a reader who
 * opened, finished and saved the same topic really did say three things about it. */
function countsAsSuccess(event: InterestEvent): boolean {
  if (event.kind === "open" || event.kind === "finish" || event.kind === "save") return true;
  return event.kind === "onboarding" && (event.valueMs ?? 0) > 0;
}

function countsAsFailure(event: InterestEvent): boolean {
  if (event.kind === "dislike") return true;
  return event.kind === "onboarding" && (event.valueMs ?? 0) < 0;
}

/** Raw success/dislike counts per topic (no decay) — the Beta-distribution input for Thompson
 * sampling (thompson.ts), which needs counts, not a decayed continuous score. Every topic
 * that appears in any event (any kind) is included, so a topic with only impressions still
 * gets a neutral Beta(1,1) prior, and a first-run stance seeds the topic's very first pull. */
/**
 * What the reader's history says about a topic, in the only two terms the exploration lane
 * needs: have they ever engaged with it, and have they ever turned it down.
 */
export interface TopicEvidence {
  /** Topics with at least one self-interested action on them — opened, finished, saved, or a
   * 想看 stance. Seeing a card is not engaging with it, which is the whole point: a topic the
   * grid has merely shown must stay in the exploration lane until the reader does something. */
  engaged: ReadonlySet<string>;
  /** Topics whose only evidence is negative: 不感兴趣, or a 不想看 stance, and nothing positive
   * anywhere. Neither familiar nor worth exploring — the feed leaves them to the ranking. */
  avoided: ReadonlySet<string>;
}

/**
 * Splits the topics in the event stream into the two sets above (spec 053 T9 findings #2 and
 * #3). Everything else — every topic with no history, and every topic the reader has only ever
 * scrolled past — is in neither set, which is what the feed treats as unexplored territory.
 */
export function classifyTopicsByEvidence(events: readonly InterestEvent[]): TopicEvidence {
  const engaged = new Set<string>();
  const avoided = new Set<string>();
  for (const stats of topicStatsFromEvents(events)) {
    if (stats.opens > 0) engaged.add(stats.topicLabel);
    else if (stats.dislikes > 0) avoided.add(stats.topicLabel);
  }
  return { engaged, avoided };
}

export function topicStatsFromEvents(events: readonly InterestEvent[]): TopicStats[] {
  const statsByTopic = new Map<string, TopicStats>();
  for (const event of events) {
    const stats = statsByTopic.get(event.topicLabel) ?? {
      topicLabel: event.topicLabel,
      opens: 0,
      dislikes: 0,
    };
    if (countsAsSuccess(event)) stats.opens += 1;
    if (countsAsFailure(event)) stats.dislikes += 1;
    statsByTopic.set(event.topicLabel, stats);
  }
  return [...statsByTopic.values()];
}
