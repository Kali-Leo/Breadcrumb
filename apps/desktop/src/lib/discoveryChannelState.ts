/**
 * Purpose: the channel_state half of fetch discipline (spec 053 §2) — what one channel told us
 * last time (ETag / Last-Modified), when it was last asked, whether it answered, how long its
 * failure streak is and how much of today's request budget it has spent. The channel layer's own
 * ledger is in-memory and starts empty on every launch; this is what makes a dead source stay
 * skipped, a spent budget stay spent, and a channel's minimum interval hold across restocks and
 * restarts. Side effects: reads and writes the channel_state table.
 * Main exports: localDayKey, readChannelStates, createChannelStateConditionalStore,
 * isSourceAvailableNow, recordSourceFetch, recordSourceSearch.
 */
import type { ChannelStateRow } from "@breadcrumb/core-db";
import {
  type ChannelSource,
  type ConditionalRequestStore,
  defaultBaseBackoffMilliseconds,
  defaultMaximumBackoffMilliseconds,
  isSourceTemplate,
  type SourceFetchResult,
} from "@breadcrumb/plugin-channels";
import { getRepos } from "./db";

/** Local calendar day, matching how the channel layer keys its own daily budget. */
export function localDayKey(now: Date): string {
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function blankState(sourceId: string): ChannelStateRow {
  return {
    source_id: sourceId,
    etag: null,
    last_modified: null,
    last_fetch_at: null,
    reachable: null,
    failure_count: 0,
    daily_budget_used: 0,
    budget_day: null,
  };
}

export async function readChannelStates(): Promise<Map<string, ChannelStateRow>> {
  const repos = await getRepos();
  const rows = await repos.channelState.listAll();
  return new Map(rows.map((row) => [row.source_id, row]));
}

/** Hands the channel fetcher a place to keep validators. A failed read or write only costs
 * bandwidth on the next poll, so both swallow their errors rather than failing the fetch. */
export function createChannelStateConditionalStore(): ConditionalRequestStore {
  return {
    async read(sourceId: string): Promise<unknown> {
      const repos = await getRepos();
      const row = await repos.channelState.get(sourceId);
      if (row === null) return null;
      return { etag: row.etag, lastModified: row.last_modified };
    },
    async write(sourceId, state): Promise<void> {
      const repos = await getRepos();
      const existing = (await repos.channelState.get(sourceId)) ?? blankState(sourceId);
      await repos.channelState.upsert({
        ...existing,
        etag: state.etag,
        last_modified: state.lastModified,
      });
    },
  };
}

/** How long a source with this failure streak waits before it is worth trying again — the same
 * 1-minute-doubling-to-6-hours curve the channel layer uses in memory. */
function backoffMilliseconds(failureCount: number): number {
  if (failureCount <= 0) return 0;
  const doubled = defaultBaseBackoffMilliseconds * 2 ** Math.min(failureCount - 1, 30);
  return Math.min(doubled, defaultMaximumBackoffMilliseconds);
}

/**
 * Whether polling this source right now is worth a request. A source inside its minimum
 * interval, in backoff, or out of today's budget is skipped in silence — the reader is never told
 * that a channel is down, they just see the cards from the channels that are up (spec 053 总则).
 *
 * The interval is checked here rather than only in the channel layer's ledger because that ledger
 * lives on a ChannelFetcher instance, and a new fetcher is built for every round: five restocks in
 * one second used to mean five polls of every source, against a catalog that says at most one
 * every thirty minutes (spec 053 T9 finding #9). channel_state already carries the instant of the
 * last attempt, which is exactly what the rule needs and what survives a restart.
 */
export function isSourceAvailableNow(
  source: ChannelSource,
  state: ChannelStateRow | undefined,
  now: Date,
): boolean {
  if (isSourceTemplate(source)) return false;
  if (state === undefined) return true;
  if (
    state.budget_day === localDayKey(now) &&
    (state.daily_budget_used ?? 0) >= source.fetchPolicy.dailyRequestBudget
  ) {
    return false;
  }
  if (state.last_fetch_at === null) return true;
  const lastFetch = Date.parse(state.last_fetch_at);
  if (Number.isNaN(lastFetch)) return true;
  const sinceLastAttempt = now.getTime() - lastFetch;
  // A record from the future is a clock that moved backwards, not a poll we owe a wait for.
  if (sinceLastAttempt < 0) return true;
  const failureCount = state.failure_count ?? 0;
  const wait = Math.max(
    source.fetchPolicy.minimumIntervalMilliseconds,
    backoffMilliseconds(failureCount),
  );
  return sinceLastAttempt >= wait;
}

/** Charges one poll to the source's day and records whether it answered. A skipped poll — the
 * request never left, so nothing was learned — only rolls the day over, and in particular leaves
 * the last-attempt instant the minimum interval is measured from where it was. */
export async function recordSourceFetch(result: SourceFetchResult, now: Date): Promise<void> {
  const repos = await getRepos();
  const existing = (await repos.channelState.get(result.sourceId)) ?? blankState(result.sourceId);
  const today = localDayKey(now);
  const spentToday = existing.budget_day === today ? (existing.daily_budget_used ?? 0) : 0;
  const status = result.outcome.status;
  if (status === "skipped") {
    await repos.channelState.upsert({
      ...existing,
      daily_budget_used: spentToday,
      budget_day: today,
    });
    return;
  }
  const answered = status === "fetched" || status === "not-modified";
  await repos.channelState.upsert({
    ...existing,
    last_fetch_at: now.toISOString(),
    reachable: answered ? 1 : 0,
    failure_count: answered ? 0 : (existing.failure_count ?? 0) + 1,
    daily_budget_used: spentToday + 1 + result.followUpRequestCount,
    budget_day: today,
  });
}

/**
 * Records what one recall query learned about a source it queried. The channels that answer
 * queries used to leave no trace at all here — `podcast-search` landed 59 cards in one launch with
 * its row still holding a NULL last_fetch_at, an unset reachable and a zero budget (spec 053
 * T10c) — so nothing downstream could tell a source that had just answered from one nobody had
 * ever reached.
 *
 * The two halves of a poll's bookkeeping split here on purpose. When a source was asked and
 * whether it answered are facts about the source, and freshness, backoff and the diagnostics all
 * read them, so a search writes them exactly as a poll does. The daily count is not: it is the
 * polling allowance isSourceAvailableNow gates the next poll on, and a day's searching is already
 * capped elsewhere, by the recall budget row (discoveryRecall's DAILY_RECALL_QUERY_BUDGET).
 * Charging queries to it as well would let one day of recall spend arXiv's eight-request poll
 * allowance and switch its feed off for the rest of the day.
 */
export async function recordSourceSearch(
  sourceId: string,
  answered: boolean,
  now: Date,
): Promise<void> {
  const repos = await getRepos();
  const existing = (await repos.channelState.get(sourceId)) ?? blankState(sourceId);
  await repos.channelState.upsert({
    ...existing,
    last_fetch_at: now.toISOString(),
    reachable: answered ? 1 : 0,
    failure_count: answered ? 0 : (existing.failure_count ?? 0) + 1,
  });
}
