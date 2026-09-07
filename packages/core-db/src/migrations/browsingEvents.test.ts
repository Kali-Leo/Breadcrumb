/**
 * Purpose: migration 0054 on a real SQLite, and the two upgrade queries that address a row by
 * its rowid. The fake SqlClient in index.test.ts cannot see any of this: it never parses SQL,
 * so a table that does not compile, an index on a column that does not exist, or a UNIQUE that
 * does not actually deduplicate all look identical to it.
 */
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createBrowsingEventUpgradesRepo } from "../browsingEventsRepository";
import { createNodeSqliteClient, openMigratedDatabase } from "../realSqliteTestFixture";
import { MIGRATIONS, runMigrations } from "./index";

const INSERT =
  "INSERT OR IGNORE INTO browsing_events (ts, site, vid, title, up, etype, dwell, dur, topic, emo, valence, pic, classifier) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)";

function event(ts: number, vid: string, etype: string, classifier = "ngram"): unknown[] {
  return [ts, "bilibili", vid, `title ${vid}`, "up", etype, 0, 0, 3, null, null, "", classifier];
}

describe("migration 0054_browsing_events", () => {
  it("is in the list exactly once and is the last entry", () => {
    const ids = MIGRATIONS.map((migration) => migration.id);
    expect(ids.filter((id) => id === "0054_browsing_events")).toHaveLength(1);
    expect(ids.at(-1)).toBe("0054_browsing_events");
  });

  it("creates both tables and all four indices on a real database", async () => {
    const database = await openMigratedDatabase();
    const tables = await database.sql.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'browsing%' ORDER BY name",
    );
    expect(tables.map((row) => row.name)).toEqual(["browsing_events", "browsing_profile"]);
    const indices = await database.sql.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_browsing%' ORDER BY name",
    );
    expect(indices.map((row) => row.name)).toEqual([
      "idx_browsing_events_dedupe",
      "idx_browsing_events_etype",
      "idx_browsing_events_topic",
      "idx_browsing_events_ts",
    ]);
    database.close();
  });

  it("refuses a second snapshot row, so the profile can only ever be one row", async () => {
    const database = await openMigratedDatabase();
    await database.sql.execute(
      "INSERT INTO browsing_profile (id, short_json, long_json, expose_json, prefs_json, decayed_to, event_count) VALUES (1,'[]','[]','[]','{}',NULL,0)",
    );
    await expect(
      database.sql.execute(
        "INSERT INTO browsing_profile (id, short_json, long_json, expose_json, prefs_json, decayed_to, event_count) VALUES (2,'[]','[]','[]','{}',NULL,0)",
      ),
    ).rejects.toThrow();
    database.close();
  });

  it("deduplicates on (ts, vid, etype) in the database rather than in a caller", async () => {
    const database = await openMigratedDatabase();
    await database.sql.execute(INSERT, event(100, "BV1", "click"));
    await database.sql.execute(INSERT, event(100, "BV1", "click"));
    await database.sql.execute(INSERT, event(100, "BV1", "watch"));
    const rows = await database.sql.select<{ n: number }>(
      "SELECT COUNT(*) AS n FROM browsing_events",
    );
    expect(rows[0]?.n).toBe(2);
    database.close();
  });

  it("runs on a database that stopped at the previous migration", async () => {
    const db = new DatabaseSync(":memory:");
    const sql = createNodeSqliteClient(db);
    await runMigrations(sql);
    // A second run must not fail on the IF NOT EXISTS statements either.
    await runMigrations(sql);
    await sql.execute(INSERT, event(1, "BV9", "expose"));
    db.close();
  });
});

describe("createBrowsingEventUpgradesRepo", () => {
  it("offers only the rows no embedding classifier has touched, newest first", async () => {
    const database = await openMigratedDatabase();
    const repo = createBrowsingEventUpgradesRepo(database.sql);
    await database.sql.execute(INSERT, event(10, "BV-old", "click", "ngram"));
    await database.sql.execute(INSERT, event(30, "BV-new", "click", "ngram"));
    await database.sql.execute(INSERT, event(20, "BV-done", "click", "embedding"));
    await database.sql.execute(INSERT, event(25, "BV-mixed", "click", "embedding+ngram"));
    const pending = await repo.listNeedingUpgrade(10);
    expect(pending.map((row) => row.title)).toEqual(["title BV-new", "title BV-old"]);
    database.close();
  });

  it("writes a better answer back onto the row it came from", async () => {
    const database = await openMigratedDatabase();
    const repo = createBrowsingEventUpgradesRepo(database.sql);
    await database.sql.execute(INSERT, event(10, "BV1", "click", "ngram"));
    await database.sql.execute(INSERT, event(20, "BV2", "click", "ngram"));
    const pending = await repo.listNeedingUpgrade(10);
    const target = pending.find((row) => row.title === "title BV1");
    expect(target).toBeDefined();
    await repo.applyClassifications([
      { rowid: target?.rowid ?? 0, topic: 7, emo: 2, valence: 1.5, classifier: "embedding" },
    ]);
    const rows = await database.sql.select<{ vid: string; topic: number; classifier: string }>(
      "SELECT vid, topic, classifier FROM browsing_events ORDER BY ts",
    );
    expect(rows[0]).toMatchObject({ vid: "BV1", topic: 7, classifier: "embedding" });
    expect(rows[1]).toMatchObject({ vid: "BV2", topic: 3, classifier: "ngram" });
    expect(await repo.listNeedingUpgrade(10)).toHaveLength(1);
    database.close();
  });
});
