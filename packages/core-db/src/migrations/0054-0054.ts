/**
 * Purpose: shipped migration 0054. Part of the append-only MIGRATIONS list assembled in
 * ./index.ts — see that file for the rules.
 * 0054 — the two tables behind the discovery page: every browsing event a collector script
 * delivered, and the one-row interest-profile snapshot built from them.
 *
 * The statements are a verbatim copy of BROWSING_EVENTS_MIGRATION in
 * packages/feature-browsing-interest/src/eventStore.ts, which is where the schema is designed
 * and documented next to the repository that reads it. It is copied rather than imported
 * because core-db is the dependency of every feature package and must not depend back on one;
 * apps/desktop/src/lib/platform/db.test.ts imports both and fails if the two ever drift.
 * Main exports: MIGRATIONS_0054_0054.
 */
import type { Migration } from "./migration";

export const MIGRATIONS_0054_0054: readonly Migration[] = [
  {
    // Deduplication is a UNIQUE index rather than a SELECT-then-INSERT: a collector retries a
    // batch it never got an answer for, and the check and the write must not be two steps that
    // another write can slip between.
    //
    // No id column: the table is append-only evidence keyed by (when, what, how), and SQLite's
    // own rowid is what the background re-classification pass addresses a row by.
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
  },
];
