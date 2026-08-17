/**
 * Purpose: the mechanical judges over a discovery journey — what share of the cards a reader was
 * shown belonged to a topic, whether anything was shown twice in one sitting, and how much of the
 * grid went to territory the reader has no history with. Pure counting over DayRecords; no DB, no
 * I/O.
 * Main exports: topicCounts, shareOfTopics, allShown, duplicatesWithinDay, unfamiliarCount.
 * The per-page quota judging lives next door in discoveryQuotaJudge.ts.
 */
import type { DiscoveryCardRow, DiscoveryEventRow } from "@breadcrumb/core-db";
import {
  classifyTopicsByEvidence,
  establishedTopics,
  foldInterestFromEvents,
  topicAffinities,
} from "@breadcrumb/plugin-discovery";
import { discoveryRowsToInterestEvents } from "../../../../apps/desktop/src/lib/discoveryOrdering";
import type { DayRecord } from "./discoveryJourneyHarness";

export function topicCounts(cards: readonly DiscoveryCardRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) {
    counts.set(card.topic_label, (counts.get(card.topic_label) ?? 0) + 1);
  }
  return counts;
}

/** Share of `cards` whose topic is one of `topics`, 0..1. Zero cards means zero share. */
export function shareOfTopics(
  cards: readonly DiscoveryCardRow[],
  topics: readonly string[],
): number {
  if (cards.length === 0) return 0;
  const wanted = new Set(topics);
  return cards.filter((card) => wanted.has(card.topic_label)).length / cards.length;
}

/** Every card shown across the given days, in order. */
export function allShown(days: readonly DayRecord[]): DiscoveryCardRow[] {
  return days.flatMap((day) => day.shown);
}

/** Card ids that appeared more than once inside one day's grid — the same sitting must never
 * put the same card in front of the reader twice. */
export function duplicatesWithinDay(day: DayRecord): string[] {
  const seen = new Set<string>();
  const repeated: string[] = [];
  for (const card of day.shown) {
    if (seen.has(card.id)) repeated.push(card.id);
    seen.add(card.id);
  }
  return repeated;
}

/**
 * How many of a day's cards came from a topic the reader had not made part of their reading at
 * the moment the day started — the exploration lane, measured from the outside, with the same
 * rule the feed itself uses (rankingScore.establishedTopics): a topic counts as theirs once they
 * have engaged with it AND it stands clearly above their average interest. Counting "appears
 * anywhere in the event stream" instead — as this did until the T9 fix — made every topic
 * familiar the first time the grid showed it, since showing a card records an impression.
 * Refused topics are not exploration material either and are left out of the count.
 */
export function unfamiliarCount(
  day: DayRecord,
  eventsBeforeDay: readonly DiscoveryEventRow[],
): number {
  const events = discoveryRowsToInterestEvents(eventsBeforeDay);
  const asOf = eventsBeforeDay.at(-1)?.created_at ?? new Date(0).toISOString();
  const evidence = classifyTopicsByEvidence(events);
  const established = establishedTopics(
    topicAffinities(foldInterestFromEvents(events, asOf)),
    evidence,
  );
  return day.shown.filter(
    (card) => !established.has(card.topic_label) && !evidence.avoided.has(card.topic_label),
  ).length;
}
