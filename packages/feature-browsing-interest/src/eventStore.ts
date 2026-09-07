/**
 * Purpose: browsing events and the profile snapshot, in Breadcrumb's own database. This
 * replaces the separate SQLite file the reference implementation kept under `~/.interest-model`
 * and the loopback port that fronted it: there is no second process and no second database any
 * more, so nothing about the learner's browsing ever leaves this app.
 *
 * Ported from Kali-Leo/feed-mode (`interest-model/daemon/app.py:171-192` for the schema and the
 * indices, `app.py:227-239` for the duplicate rule, `app.py:258-263` for the snapshot), GPL-3.0,
 * same copyright holder; modified 2026-09-07 (Python/sqlite3 → an injected SqlClient; the `kv`
 * table replaced by a typed one-row snapshot table; a `classifier` column added so a later,
 * better classifier can find and re-label the rows an earlier one wrote).
 *
 * The SqlClient interface is declared here, structurally identical to core-db's, so this
 * package can be tested and reviewed without depending on the database package. The migration
 * statements are exported rather than executed: they belong in core-db's append-only list, and
 * appending them there is the wiring step, not this file's job.
 * Main exports: SqlClient, BROWSING_EVENTS_MIGRATION, createBrowsingEventStore.
 */

import type { BrowsingEventRow } from "./events";
import type { InterestProfileState } from "./profileEngine";

/** The database access the host injects. Matches @breadcrumb/core-db's SqlClient. */
export interface SqlClient {
  select<Row>(sql: string, params?: readonly unknown[]): Promise<Row[]>;
  execute(sql: string, params?: readonly unknown[]): Promise<void>;
}

/**
 * The schema, ready to append to core-db's migration list. Deduplication is a UNIQUE index
 * rather than a SELECT-then-INSERT: collectors retry batches on backoff, and the check and the
 * write must not be two steps that another write can slip between.
 */
export const BROWSING_EVENTS_MIGRATION = {
  id: "0054_browsing_events",
  statements: [
    `CREATE TABLE IF NOT EXISTS browsing_events (
       ts REAL NOT NULL,
       site TEXT NOT NULL DEFAULT '?',
       vid TEXT NOT NULL DEFAULT '',
       title TEXT NOT NULL DEFAULT '',
       up TEXT NOT NULL DEFAULT '',
       etype TEXT NOT NULL,
       dwell REAL NOT NULL DEFAULT 0,
       dur REAL NOT NULL DEFAULT 0,
       topic INTEGER,
       emo INTEGER,
       valence REAL,
       pic TEXT NOT NULL DEFAULT '',
       classifier TEXT NOT NULL DEFAULT ''
     )`,
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_browsing_events_dedupe ON browsing_events(ts, vid, etype)",
    "CREATE INDEX IF NOT EXISTS idx_browsing_events_ts ON browsing_events(ts)",
    "CREATE INDEX IF NOT EXISTS idx_browsing_events_topic ON browsing_events(topic, etype, ts)",
    "CREATE INDEX IF NOT EXISTS idx_browsing_events_etype ON browsing_events(etype, ts)",
    `CREATE TABLE IF NOT EXISTS browsing_profile (
       id INTEGER PRIMARY KEY CHECK (id = 1),
       short_json TEXT NOT NULL,
       long_json TEXT NOT NULL,
       expose_json TEXT NOT NULL,
       prefs_json TEXT NOT NULL,
       decayed_to REAL,
       event_count INTEGER NOT NULL DEFAULT 0
     )`,
  ],
} as const;

interface ProfileSnapshotRow {
  short_json: string;
  long_json: string;
  expose_json: string;
  prefs_json: string;
  decayed_to: number | null;
  event_count: number;
}

const EVENT_COLUMNS =
  "ts, site, vid, title, up, etype, dwell, dur, topic, emo, valence, pic, classifier";

export function createBrowsingEventStore(sql: SqlClient) {
  return {
    /** Stores one event; a duplicate (same ts, video and kind) is silently ignored. */
    async insert(row: BrowsingEventRow): Promise<void> {
      await sql.execute(
        `INSERT OR IGNORE INTO browsing_events (${EVENT_COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          row.ts,
          row.site,
          row.vid,
          row.title,
          row.up,
          row.etype,
          row.dwell,
          row.dur,
          row.topic,
          row.emo,
          row.valence,
          row.pic,
          row.classifier,
        ],
      );
    },

    /** Every event in the window, oldest first — what the emotion and word-cloud panels read. */
    async listSince(since: number): Promise<BrowsingEventRow[]> {
      return sql.select<BrowsingEventRow>(
        `SELECT ${EVENT_COLUMNS} FROM browsing_events WHERE ts >= ? ORDER BY ts ASC`,
        [since],
      );
    },

    /**
     * Clicks and watches in the window, newest first. `limit` bounds the work a panel does on a
     * long history; the pro-content panel uses the reference's 2000.
     */
    async listEngagedSince(since: number, limit: number): Promise<BrowsingEventRow[]> {
      return sql.select<BrowsingEventRow>(
        `SELECT ${EVENT_COLUMNS} FROM browsing_events
          WHERE ts >= ? AND etype <> 'expose' ORDER BY ts DESC LIMIT ?`,
        [since, limit],
      );
    },

    /** Total events, and the click/watch subset — the honest measure of how much is behind a
     * share, since scrolling dominates the total. */
    async counts(): Promise<{ events: number; engaged: number }> {
      const rows = await sql.select<{ events: number; engaged: number }>(
        `SELECT COUNT(*) AS events, SUM(CASE WHEN etype <> 'expose' THEN 1 ELSE 0 END) AS engaged
           FROM browsing_events`,
      );
      const row = rows[0];
      return { events: row?.events ?? 0, engaged: row?.engaged ?? 0 };
    },

    async loadProfile(): Promise<InterestProfileState | null> {
      const rows = await sql.select<ProfileSnapshotRow>(
        "SELECT short_json, long_json, expose_json, prefs_json, decayed_to, event_count FROM browsing_profile WHERE id = 1",
      );
      const row = rows[0];
      if (row === undefined) return null;
      return {
        short: parseVector(row.short_json),
        long: parseVector(row.long_json),
        expose: parseVector(row.expose_json),
        prefs: parsePrefs(row.prefs_json),
        ts: row.decayed_to,
        n: row.event_count,
      };
    },

    async saveProfile(state: InterestProfileState): Promise<void> {
      await sql.execute(
        `INSERT INTO browsing_profile (id, short_json, long_json, expose_json, prefs_json, decayed_to, event_count)
         VALUES (1,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET short_json=excluded.short_json, long_json=excluded.long_json,
           expose_json=excluded.expose_json, prefs_json=excluded.prefs_json,
           decayed_to=excluded.decayed_to, event_count=excluded.event_count`,
        [
          JSON.stringify(state.short),
          JSON.stringify(state.long),
          JSON.stringify(state.expose),
          JSON.stringify(state.prefs),
          state.ts,
          state.n,
        ],
      );
    },
  };
}

export type BrowsingEventStore = ReturnType<typeof createBrowsingEventStore>;

/** A corrupt snapshot costs the snapshot, never the app: an unreadable vector reads as empty,
 * and the profile rebuilds from the events table on the next replay. */
function parseVector(json: string): number[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => (typeof value === "number" && Number.isFinite(value) ? value : 0));
  } catch {
    return [];
  }
}

function parsePrefs(json: string): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const prefs: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed))
      if (typeof value === "number" && Number.isFinite(value)) prefs[key] = value;
    return prefs;
  } catch {
    return {};
  }
}
