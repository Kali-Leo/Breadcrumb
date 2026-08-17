/**
 * Purpose: the mechanical judges over a discovery journey — what share of the cards a reader was
 * shown belonged to a topic, whether a page kept the cross-channel and content-form quotas the
 * spec asks for, whether anything was shown twice in one sitting, and how much of the grid went
 * to territory the reader has no history with. Pure counting over DayRecords; no DB, no I/O.
 * Main exports: topicShare, shareOfTopics, duplicatesWithinDay, quotaBreaches, unfamiliarCount.
 */
import type { DiscoveryCardRow, DiscoveryEventRow } from "@breadcrumb/core-db";
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

export interface QuotaBreach {
  dayIndex: number;
  pageIndex: number;
  dimension: "source" | "kind" | "topic";
  key: string;
  count: number;
  cap: number;
  /** How many distinct values of this dimension the day's pool could have offered instead. */
  alternativesAvailable: number;
}

/**
 * Checks one day's pages against plugin-discovery's own caps. A page that repeats one channel
 * past the cap is only a breach when the pool actually held other channels to show — a mono-
 * channel pool must still show everything it has (mmr.ts's starvation rule).
 */
export function quotaBreaches(
  day: DayRecord,
  poolAtEndOfDay: readonly DiscoveryCardRow[],
  caps: { source: number; kind: number; topic: number },
): QuotaBreach[] {
  const breaches: QuotaBreach[] = [];
  const dimensions = [
    { name: "source" as const, of: (card: DiscoveryCardRow) => card.source_id },
    { name: "kind" as const, of: (card: DiscoveryCardRow) => card.kind },
    { name: "topic" as const, of: (card: DiscoveryCardRow) => card.topic_label },
  ];
  let start = 0;
  for (const [pageIndex, boundary] of day.pageBoundaries.entries()) {
    const page = day.shown.slice(start, boundary);
    start = boundary;
    for (const dimension of dimensions) {
      const counts = new Map<string, number>();
      for (const card of page) {
        const key = dimension.of(card);
        if (key === null) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const available = new Set(
        poolAtEndOfDay.map(dimension.of).filter((key): key is string => key !== null),
      ).size;
      for (const [key, count] of counts) {
        if (count > caps[dimension.name] && available > 1) {
          breaches.push({
            dayIndex: day.dayIndex,
            pageIndex,
            dimension: dimension.name,
            key,
            count,
            cap: caps[dimension.name],
            alternativesAvailable: available,
          });
        }
      }
    }
  }
  return breaches;
}

/**
 * How many of a day's cards came from a topic the reader had no recorded history with at the
 * moment the day started — the exploration lane, measured from the outside.
 */
export function unfamiliarCount(
  day: DayRecord,
  eventsBeforeDay: readonly DiscoveryEventRow[],
): number {
  const known = new Set(eventsBeforeDay.map((event) => event.topic_label));
  return day.shown.filter((card) => !known.has(card.topic_label)).length;
}
