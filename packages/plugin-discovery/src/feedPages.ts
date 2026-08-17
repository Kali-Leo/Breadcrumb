/**
 * Purpose: assembles the feed one PAGE at a time (spec 053 §4). The quotas exist to shape what
 * the reader is actually looking at, and ranking the whole pool in one pass never did that: the
 * caps were spent inside the first two dozen candidates and every page after that was whatever
 * score order dropped out (spec 053 T9 finding #4). Here each page of `pageSize` is selected from
 * what is left, under its own fresh set of caps and its own exploration share, and the candidates
 * that page did not take are the next page's. Pure list math, no DB, no I/O.
 * Main exports: FeedPageCandidates, FeedPageOptions, assembleFeedPages.
 */
import {
  defaultExplorationShare,
  explorationPositionCount,
  interleaveExploration,
} from "./explorationQuota";
import {
  createQuotaLedger,
  defaultMmrOptions,
  type MmrCandidate,
  type MmrSelectOptions,
  type QuotaLedger,
  selectWithQuotas,
} from "./mmr";

/** One grid page: about two dozen cards, the unit the quotas above are sized for and the unit
 * the feed hands to the reader at a time. */
export const defaultFeedPageSize = 24;

export interface FeedPageCandidates<T> {
  /** Topics the reader has engaged with, plus the ones they have turned down — everything the
   * ranking already has an opinion about. */
  familiar: readonly MmrCandidate<T>[];
  /** Topics the reader has never acted on: the exploration lane's material. */
  unexplored: readonly MmrCandidate<T>[];
}

export interface FeedPageOptions extends MmrSelectOptions {
  pageSize: number;
  /** The feed's dial, 0..1 (spec 053 §6). */
  explorationShare?: number;
}

interface Lane<T> {
  taken: MmrCandidate<T>[];
  left: MmrCandidate<T>[];
}

/**
 * Which cap is holding the page up: the dimension standing in front of the most candidates still
 * waiting. Widening that one is what unblocks the page; widening the cap in front of the single
 * best card instead would quietly hand the overflow to whatever topic the reader likes most,
 * which is the one thing the topic cap exists to prevent.
 */
function mostBlockingDimension<T>(
  waiting: readonly MmrCandidate<T>[],
  ledger: QuotaLedger,
): string | undefined {
  const blocked = new Map<string, number>();
  for (const candidate of waiting) {
    for (const dimension of ledger.blockingDimensions(candidate)) {
      blocked.set(dimension, (blocked.get(dimension) ?? 0) + 1);
    }
  }
  return [...blocked.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

/**
 * Lets exactly one more card onto a page the caps cannot fill: widens the cap standing in front of
 * the most candidates until one of them fits, takes it — the familiar lane first, so the reader's
 * dial keeps its meaning — and puts the cap straight back. Everything past the caps arrives this
 * way, one card at a time; leaving a cap open would hand the whole rest of the page to whichever
 * topic happens to score highest. Returns false when no widening can produce a card.
 */
function takeOneBeyondTheCap<T>(
  exploit: Lane<T>,
  explore: Lane<T>,
  ledger: QuotaLedger,
  lambda: number,
  maximumWidening: number,
): boolean {
  const blocking = mostBlockingDimension([...exploit.left, ...explore.left], ledger);
  if (blocking === undefined) return false;
  let widenings = 0;
  let taken = 0;
  while (taken === 0 && widenings < maximumWidening) {
    ledger.widen(blocking);
    widenings += 1;
    for (const lane of [exploit, explore]) {
      if (taken > 0) continue;
      const one = selectWithQuotas(lane.left, 1, ledger, lambda);
      lane.taken.push(...one.selected);
      lane.left = one.deferred;
      taken = one.selected.length;
    }
  }
  for (let step = 0; step < widenings; step += 1) ledger.narrow(blocking);
  return taken > 0;
}

/**
 * One page. A single ledger of caps covers both lanes: the exploration lane takes its share of the
 * positions, the familiar lane fills the rest, and when either lane is empty the other takes the
 * whole page. A page the caps cannot fill — a pool of three topics cannot spread 24 cards over
 * eight of them — lets one card at a time through the cap standing in front of the most
 * candidates, so the overflow arrives at the end of the page rather than in the middle of it.
 * Cards the ranking scores below neutral (a topic the reader has refused) come last whatever else
 * happens: nothing is hidden, and nothing the reader said no to leads a page.
 */
function buildPage<T>(
  candidates: FeedPageCandidates<T>,
  options: FeedPageOptions,
): { page: T[]; left: FeedPageCandidates<T> } {
  const lambda = options.lambda ?? defaultMmrOptions.lambda;
  const share = options.explorationShare ?? defaultExplorationShare;
  const explore: Lane<T> = { taken: [], left: [...candidates.unexplored] };
  const exploit: Lane<T> = { taken: [], left: [...candidates.familiar] };
  const ledger = createQuotaLedger(options);
  const exploreQuota = explorationPositionCount(options.pageSize, share);
  for (let pass = 0; pass <= options.pageSize; pass += 1) {
    const slots = options.pageSize - explore.taken.length - exploit.taken.length;
    if (slots <= 0 || explore.left.length + exploit.left.length === 0) break;

    // Exploration holds its share of the page and no more, so long as anything familiar is left
    // to show; once the familiar lane is empty the whole page belongs to unexplored territory.
    const exploreSlots =
      exploit.left.length === 0
        ? slots
        : Math.max(0, Math.min(slots, exploreQuota - explore.taken.length));
    const explored = selectWithQuotas(explore.left, exploreSlots, ledger, lambda);
    const exploited = selectWithQuotas(
      exploit.left,
      slots - explored.selected.length,
      ledger,
      lambda,
    );

    explore.taken.push(...explored.selected);
    explore.left = explored.deferred;
    exploit.taken.push(...exploited.selected);
    exploit.left = exploited.deferred;
    // Nothing left fits: let exactly one card through the cap standing in front of the most
    // candidates, then put the cap back, so a page that cannot be filled under the caps gives up
    // one card of its variety at a time instead of the whole rest of the page.
    if (explored.selected.length + exploited.selected.length === 0) {
      if (!takeOneBeyondTheCap(exploit, explore, ledger, lambda, options.pageSize)) break;
    }
  }

  const laidOut = interleaveExploration(exploit.taken, explore.taken, share);
  return {
    page: [
      ...laidOut.filter((entry) => entry.score >= 0),
      ...laidOut.filter((entry) => entry.score < 0),
    ].map((entry) => entry.item),
    left: { familiar: exploit.left, unexplored: explore.left },
  };
}

/**
 * Every page, in order, concatenated — what the grid pages through. The list is the same length
 * as the candidate set: nothing is dropped, it is only laid out page by page.
 */
export function assembleFeedPages<T>(
  candidates: FeedPageCandidates<T>,
  options: FeedPageOptions,
): T[] {
  if (options.pageSize <= 0) return [];
  const ordered: T[] = [];
  let left = candidates;
  while (left.familiar.length + left.unexplored.length > 0) {
    const built = buildPage(left, options);
    if (built.page.length === 0) break;
    ordered.push(...built.page);
    left = built.left;
  }
  return ordered;
}
