/**
 * Purpose: the judge for spec 053 §4's 跨渠道与内容形态双配额 — whether each page the reader was
 * handed kept the per-topic, per-channel and per-content-form caps, allowing exactly the
 * concentration the candidates left at that point force on it. Pure counting over DayRecords; no
 * DB, no I/O.
 * Main exports: QuotaBreach, quotaBreaches.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import {
  assembleFeedPages,
  defaultExplorationShare,
  defaultFeedPageSize,
  explorationPositionCount,
  type MmrCandidate,
} from "@breadcrumb/plugin-discovery";
import type { DayRecord } from "./discoveryJourneyHarness";

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

const QUOTA_DIMENSIONS = [
  { name: "source" as const, of: (card: DiscoveryCardRow) => card.source_id },
  { name: "kind" as const, of: (card: DiscoveryCardRow) => card.kind },
  { name: "topic" as const, of: (card: DiscoveryCardRow) => card.topic_label },
];

type QuotaCaps = { source: number; kind: number; topic: number };

/** Only a page the grid filled completely says anything about how the ranker chose. */
const FULL_PAGE = defaultFeedPageSize;

/** Counts of every dimension's values across one page. */
function pageCounts(page: readonly DiscoveryCardRow[]): Map<string, Map<string, number>> {
  const counts = new Map<string, Map<string, number>>();
  for (const dimension of QUOTA_DIMENSIONS) {
    const perValue = new Map<string, number>();
    for (const card of page) {
      const key = dimension.of(card);
      if (key === null) continue;
      perValue.set(key, (perValue.get(key) ?? 0) + 1);
    }
    counts.set(dimension.name, perValue);
  }
  return counts;
}

/** The cards as the ranker's quota arithmetic sees them, all scored alike: what matters here is
 * the shape of the candidate supply, not which card is best. */
function asQuotaCandidates(cards: readonly DiscoveryCardRow[]): MmrCandidate<DiscoveryCardRow>[] {
  return cards.map((card) => ({
    item: card,
    score: 0,
    embedding: null,
    topicLabel: card.topic_label,
    sourceId: card.source_id,
    contentKind: card.kind,
  }));
}

/**
 * How concentrated a page of `pageSize` HAS to be, given these candidates: the largest count each
 * dimension reaches when the same caps are filled by plugin-discovery's own page assembly over a
 * flat scoring, where nothing but the supply can push a count up. A cap only holds while the
 * supply allows it — when the one channel publishing discussions is capped at five, the articles
 * have to carry the rest of the page or the page is short — and this is what that arithmetic
 * comes to.
 */
function forcedConcentration(
  candidates: readonly DiscoveryCardRow[],
  pageSize: number,
  caps: QuotaCaps,
): Map<string, number> {
  const reference = assembleFeedPages(
    { familiar: asQuotaCandidates(candidates), unexplored: [] },
    {
      pageSize,
      explorationShare: 0,
      perTopicCap: caps.topic,
      perSourceCap: caps.source,
      perKindCap: caps.kind,
    },
  ).slice(0, pageSize);
  const counts = pageCounts(reference);
  const worst = new Map<string, number>();
  for (const dimension of QUOTA_DIMENSIONS) {
    worst.set(dimension.name, Math.max(0, ...(counts.get(dimension.name)?.values() ?? [])));
  }
  return worst;
}

/**
 * Checks one day's full pages against plugin-discovery's own caps, allowing each page the
 * concentration the candidates left at that point force on it (forcedConcentration) plus the
 * positions the reader's dial has reserved for the other lane — those are not available to the
 * caps, so a page whose familiar half is capped out has to widen a cap somewhere to stay full.
 * Short pages are skipped: a page that came up short is whatever the pool held at that moment,
 * not a choice between candidates.
 *
 * Counting "were there other values in the pool at all" instead — as this did until the T9 fix —
 * flagged pages nobody could have assembled (two content forms cannot spread twenty-four cards
 * under a cap of ten by any arrangement) and said nothing about the real failure, which was one
 * channel taking three quarters of a page while five others waited.
 */
export function quotaBreaches(
  day: DayRecord,
  poolAtEndOfDay: readonly DiscoveryCardRow[],
  caps: QuotaCaps,
  explorationShare: number = defaultExplorationShare,
): QuotaBreach[] {
  const breaches: QuotaBreach[] = [];
  let start = 0;
  for (const [pageIndex, boundary] of day.pageBoundaries.entries()) {
    const page = day.shown.slice(start, boundary);
    const candidates = day.shown.slice(start);
    start = boundary;
    if (page.length < FULL_PAGE) continue;
    const counts = pageCounts(page);
    const forced = forcedConcentration(candidates, page.length, caps);
    const reserved = explorationPositionCount(page.length, explorationShare);
    for (const dimension of QUOTA_DIMENSIONS) {
      for (const [key, count] of counts.get(dimension.name) ?? []) {
        const allowed = Math.max(
          caps[dimension.name],
          (forced.get(dimension.name) ?? 0) + reserved,
        );
        if (count <= allowed) continue;
        breaches.push({
          dayIndex: day.dayIndex,
          pageIndex,
          dimension: dimension.name,
          key,
          count,
          cap: allowed,
          alternativesAvailable: new Set(
            poolAtEndOfDay.map(dimension.of).filter((value): value is string => value !== null),
          ).size,
        });
      }
    }
  }
  return breaches;
}
