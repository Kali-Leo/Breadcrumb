/**
 * Purpose: the running counts behind the discovery feed's quotas (spec 053 §4) — how many cards of
 * one topic, one channel and one content form a page has taken so far, and whether the next
 * candidate still fits. Kept apart from the reranking itself because one page is assembled out of
 * two lanes and they have to share one set of counters. Pure math, no DB, no I/O.
 * Main exports: QuotaLedger, createQuotaLedger.
 */
import { defaultMmrOptions, type MmrCandidate, type MmrSelectOptions } from "./mmr";

/** The three quota dimensions of one candidate. A null dimension is exempt: an item with no
 * channel cannot crowd out a channel. */
function quotaKeys<T>(candidate: MmrCandidate<T>): { dimension: string; key: string }[] {
  const keys = [{ dimension: "topic", key: candidate.topicLabel }];
  if (candidate.sourceId) keys.push({ dimension: "source", key: candidate.sourceId });
  if (candidate.contentKind) keys.push({ dimension: "kind", key: candidate.contentKind });
  return keys;
}

function capFor(dimension: string, options: Required<MmrSelectOptions>): number {
  if (dimension === "source") return options.perSourceCap;
  if (dimension === "kind") return options.perKindCap;
  return options.perTopicCap;
}

/** The running counts of one page's three quota dimensions. Shared between the lanes a page is
 * built from, so the caps hold across the whole page rather than inside each lane. */
export interface QuotaLedger {
  isFree<T>(candidate: MmrCandidate<T>): boolean;
  take<T>(candidate: MmrCandidate<T>): void;
  /** Which of the candidate's dimensions are at their cap right now — what would have to give
   * for this candidate to be selectable. Empty when it is free. */
  blockingDimensions<T>(candidate: MmrCandidate<T>): string[];
  /** Widens one dimension's cap by one, and narrows it back. The three caps can be jointly
   * unsatisfiable even where each is satisfiable on its own — a page cannot be filled with
   * articles alone when the one channel that publishes discussions is capped at five — and a page
   * that cannot be filled has to give somewhere. Widening for exactly one card and then putting
   * the cap back is the least it can give: the caps never quietly stay open for the rest of the
   * page, where the best-scoring topic would spend all of the slack on itself. */
  widen(dimension: string): void;
  narrow(dimension: string): void;
}

export function createQuotaLedger(options: MmrSelectOptions = {}): QuotaLedger {
  const settings: Required<MmrSelectOptions> = { ...defaultMmrOptions, ...options };
  const counts = new Map<string, number>();
  return {
    isFree(candidate) {
      return quotaKeys(candidate).every(
        ({ dimension, key }) =>
          (counts.get(`${dimension}:${key}`) ?? 0) < capFor(dimension, settings),
      );
    },
    take(candidate) {
      for (const { dimension, key } of quotaKeys(candidate)) {
        const countKey = `${dimension}:${key}`;
        counts.set(countKey, (counts.get(countKey) ?? 0) + 1);
      }
    },
    blockingDimensions(candidate) {
      return quotaKeys(candidate)
        .filter(
          ({ dimension, key }) =>
            (counts.get(`${dimension}:${key}`) ?? 0) >= capFor(dimension, settings),
        )
        .map(({ dimension }) => dimension);
    },
    widen(dimension) {
      if (dimension === "source") settings.perSourceCap += 1;
      else if (dimension === "kind") settings.perKindCap += 1;
      else settings.perTopicCap += 1;
    },
    narrow(dimension) {
      if (dimension === "source") settings.perSourceCap -= 1;
      else if (dimension === "kind") settings.perKindCap -= 1;
      else settings.perTopicCap -= 1;
    },
  };
}
