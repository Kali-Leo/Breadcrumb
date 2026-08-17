/**
 * Purpose: SQL statements for channel_state (spec 053 §2) — per-channel conditional-request
 * validators, reachability and the per-day request budget the fetch discipline runs on.
 * Main exports: createChannelStateRepo factory.
 */
import type { ChannelStateRow } from "./channelTypes";
import type { SqlClient } from "./types";

export function createChannelStateRepo(sql: SqlClient) {
  return {
    /** One channel's state, or null when it has never been fetched. */
    async get(sourceId: string): Promise<ChannelStateRow | null> {
      const rows = await sql.select<ChannelStateRow>(
        "SELECT * FROM channel_state WHERE source_id = ? LIMIT 1",
        [sourceId],
      );
      return rows[0] ?? null;
    },
    /** Every channel's state — the poller's whole working set in one read. */
    async listAll(): Promise<ChannelStateRow[]> {
      return sql.select<ChannelStateRow>("SELECT * FROM channel_state ORDER BY source_id ASC");
    },
    /** Writes a channel's state after a fetch attempt, inserting it the first time. Every
     * column is written, so a caller that read the row first cannot silently drop a field. */
    async upsert(row: ChannelStateRow): Promise<void> {
      await sql.execute(
        `INSERT INTO channel_state
           (source_id, etag, last_modified, last_fetch_at, reachable, failure_count,
            daily_budget_used, budget_day)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_id) DO UPDATE SET
           etag = excluded.etag,
           last_modified = excluded.last_modified,
           last_fetch_at = excluded.last_fetch_at,
           reachable = excluded.reachable,
           failure_count = excluded.failure_count,
           daily_budget_used = excluded.daily_budget_used,
           budget_day = excluded.budget_day`,
        [
          row.source_id,
          row.etag,
          row.last_modified,
          row.last_fetch_at,
          row.reachable,
          row.failure_count,
          row.daily_budget_used,
          row.budget_day,
        ],
      );
    },
    /** Rolls every channel over to a new day: budgets spent on an earlier day go back to zero.
     * Channels already on `day` keep what they have spent, so calling this on every poll is
     * safe. `day` is a YYYY-MM-DD local day string. */
    async resetDailyBudget(day: string): Promise<void> {
      await sql.execute(
        `UPDATE channel_state SET daily_budget_used = 0, budget_day = ?
         WHERE budget_day IS NULL OR budget_day <> ?`,
        [day, day],
      );
    },
  };
}
