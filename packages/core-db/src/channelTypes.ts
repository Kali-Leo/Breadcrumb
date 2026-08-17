/**
 * Purpose: row type for the external content channels' fetch bookkeeping (spec 053 §2) —
 * conditional-request validators, reachability, and the per-day request budget.
 * Main exports: ChannelStateRow.
 */

/** One row per channel (source_id matches the catalog entry the fetch came from). etag and
 * last_modified are the validators echoed back as If-None-Match / If-Modified-Since, so an
 * unchanged feed answers 304 and costs near zero bytes. reachable is a boolean-as-INTEGER
 * (1 = the last fetch succeeded, 0 = it did not, NULL = never tried), and failure_count is
 * the consecutive-failure streak driving exponential backoff; an unreachable channel is
 * skipped silently, never surfaced as an error. daily_budget_used counts requests already
 * spent on budget_day (a YYYY-MM-DD local day string); a new day resets the counter. */
export interface ChannelStateRow {
  source_id: string;
  etag: string | null;
  last_modified: string | null;
  last_fetch_at: string | null;
  reachable: number | null;
  failure_count: number | null;
  daily_budget_used: number | null;
  budget_day: string | null;
}
