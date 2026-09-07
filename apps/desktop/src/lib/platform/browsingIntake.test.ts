/**
 * Purpose: the whole discovery pipeline over a real SQLite — a collector's batch goes in, and
 * the four panels come out of the database with nothing in between mocked but the embedder.
 *
 * A real database rather than a fake one, because most of what could go wrong here is SQL:
 * the UNIQUE index that makes a re-delivered batch a no-op, the one-row profile snapshot, the
 * rowid the upgrade pass addresses a row by. A fake client parses none of that.
 */
import { DatabaseSync } from "node:sqlite";
import {
  createBrowsingEventUpgradesRepo,
  runMigrations,
  type SqlClient,
  type SqlTransactionStatement,
} from "@breadcrumb/core-db";
import {
  createBrowsingEventStore,
  topicClassifierHead,
} from "@breadcrumb/feature-browsing-interest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => ({ repos: null as unknown, vectors: null as number[][] | null }));

vi.mock("./db", () => ({ getRepos: async () => shared.repos }));
vi.mock("./failureLog", () => ({ degradeSilently: vi.fn(async () => undefined) }));
vi.mock("./embeddings", () => ({ embedTexts: async () => shared.vectors }));

const { receiveBrowsingEvents } = await import("./browsingIntake");
const { readDiscoveryData } = await import("./browsingPanels");
const { upgradeBrowsingClassifications } = await import("./browsingUpgrade");

function nodeSqlite(db: DatabaseSync): SqlClient {
  const run = (statement: SqlTransactionStatement): void => {
    const params = statement.params;
    if (params === undefined || params.length === 0) db.exec(statement.sql);
    else db.prepare(statement.sql).run(...(params as readonly never[]));
  };
  return {
    select: async <Row>(sql: string, params?: readonly unknown[]) =>
      db.prepare(sql).all(...((params ?? []) as readonly never[])) as Row[],
    execute: async (sql, params) => run({ sql, params }),
    executeTransaction: async (statements) => {
      db.exec("BEGIN");
      try {
        for (const statement of statements) run(statement);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

/** Just before the real clock: a collector timestamp in the future is not trusted (events.ts
 * replaces it with "now"), and a test that pinned a round number in 2027 would be testing that
 * rule instead of the pipeline. */
const NOW = Math.floor(Date.now() / 1000) - 60;
const query = { emotionCategory: "all", wordCloudDays: 30, now: NOW } as const;

function event(kind: "expose" | "click" | "watch", id: string, title: string, ageDays = 0) {
  return {
    type: kind,
    id,
    t: title,
    u: "某某老师",
    pic: "",
    site: "bilibili",
    dwell: kind === "watch" ? 300 : 0,
    dur: kind === "watch" ? 360 : 0,
    ts: NOW - ageDays * 86400,
  };
}

let database: DatabaseSync;

beforeEach(async () => {
  database = new DatabaseSync(":memory:");
  const sql = nodeSqlite(database);
  await runMigrations(sql);
  shared.repos = {
    browsingEvents: createBrowsingEventStore(sql),
    browsingEventUpgrades: createBrowsingEventUpgradesRepo(sql),
  };
  shared.vectors = null;
});

describe("an empty database", () => {
  it("is an answered question, not an error: every panel comes back empty", async () => {
    const data = await readDiscoveryData(query);
    expect(data.eventCount).toBe(0);
    expect(data.profile.n_events).toBe(0);
    expect(data.profile.topics.length).toBeGreaterThan(0);
    expect(data.wordCloud.words).toEqual([]);
    expect(data.emotion.engage).toEqual([]);
    expect(data.emotion.expose).toEqual([]);
    expect(data.newInterests.interests).toEqual([]);
    expect(data.proContent.finished).toEqual([]);
    expect(data.proContent.unfinished).toEqual([]);
  });
});

describe("a collector batch, from the wire to the four panels", () => {
  it("classifies, stores, moves the profile and fills the panels", async () => {
    const result = await receiveBrowsingEvents([
      event("click", "BV1", "线性代数入门：矩阵到底在做什么"),
      event("watch", "BV2", "傅里叶变换的直观解释"),
      event("expose", "BV3", "十分钟看懂量子纠缠"),
    ]);
    expect(result).toEqual({ received: 3, stored: 3 });

    const data = await readDiscoveryData(query);
    expect(data.eventCount).toBe(3);
    expect(data.profile.n_events).toBe(3);
    expect(data.profile.n_engaged).toBe(2);
    // The n-gram layer answered every one of them the moment it arrived.
    expect(data.profile.classifier).toBe("ngram");
    // …and it has no emotion head, so the mood panel is honestly empty while the rest is not.
    expect(data.profile.emotion_on).toBe(false);
    expect(data.emotion.engage).toEqual([]);
    expect(data.wordCloud.words.map((word) => word.w)).toContain("矩阵");
    // Two clicks is nowhere near the fifty this panel refuses to speak below.
    expect(data.newInterests.interests).toEqual([]);
    // Every stored row carries a topic, which is what every panel filters on.
    const rows = database.prepare("SELECT topic, classifier FROM browsing_events").all();
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.topic).not.toBeNull();
  });

  it("credits a re-delivered batch to nothing at all", async () => {
    const batch = [event("click", "BV1", "线性代数入门"), event("watch", "BV2", "傅里叶变换")];
    expect((await receiveBrowsingEvents(batch)).stored).toBe(2);
    const afterFirst = await readDiscoveryData(query);

    // A collector re-sends anything it did not get an answer for.
    expect((await receiveBrowsingEvents(batch)).stored).toBe(0);
    const afterSecond = await readDiscoveryData(query);

    expect(afterSecond.eventCount).toBe(2);
    expect(afterSecond.profile.short).toEqual(afterFirst.profile.short);
    expect(afterSecond.profile.long).toEqual(afterFirst.profile.long);
  });

  it("drops the entries that are not events and keeps the ones that are", async () => {
    const result = await receiveBrowsingEvents([
      event("click", "BV1", "线性代数入门"),
      "not an event",
      null,
      42,
    ]);
    expect(result).toEqual({ received: 1, stored: 1 });
  });

  it("stores nothing at all for a payload that is not a batch", async () => {
    for (const payload of [null, {}, "[]", []]) {
      expect(await receiveBrowsingEvents(payload)).toEqual({ received: 0, stored: 0 });
    }
    expect((await readDiscoveryData(query)).eventCount).toBe(0);
  });
});

describe("the background pass that re-classifies with embeddings", () => {
  it("does nothing, silently, while there is no embedder", async () => {
    await receiveBrowsingEvents([event("click", "BV1", "线性代数入门")]);
    expect(await upgradeBrowsingClassifications()).toBe(0);
    const row = database.prepare("SELECT classifier FROM browsing_events").get();
    expect(row?.classifier).toBe("ngram");
  });

  it("replaces the n-gram answer once vectors are available, and then leaves the row alone", async () => {
    await receiveBrowsingEvents([
      event("click", "BV1", "线性代数入门"),
      event("watch", "BV2", "傅里叶变换"),
    ]);
    const dims = topicClassifierHead().dims;
    shared.vectors = [
      Array.from({ length: dims }, (_, i) => Math.sin(i) / 20),
      Array(dims).fill(0.02),
    ];

    expect(await upgradeBrowsingClassifications()).toBe(2);
    const rows = database.prepare("SELECT classifier, emo, valence FROM browsing_events").all();
    for (const row of rows) {
      expect(row.classifier).toBe("embedding");
      // The embedding layer has an emotion head, so the mood panel can now say something.
      expect(row.emo).not.toBeNull();
      expect(row.valence).not.toBeNull();
    }
    // Nothing is left to upgrade, so a second pass costs no embeddings at all.
    expect(await upgradeBrowsingClassifications()).toBe(0);
    expect((await readDiscoveryData(query)).profile.emotion_on).toBe(true);
  });
});
