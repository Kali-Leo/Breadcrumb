import { describe, expect, it } from "vitest";
import { BROWSING_EVENTS_MIGRATION, createBrowsingEventStore, type SqlClient } from "./eventStore";
import type { BrowsingEventRow } from "./events";
import { createProfileState } from "./profileEngine";

interface Call {
  sql: string;
  params: readonly unknown[];
}

function fakeSql(rows: readonly unknown[] = []): SqlClient & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async select<Row>(sql: string, params: readonly unknown[] = []): Promise<Row[]> {
      calls.push({ sql, params });
      return rows as Row[];
    },
    async execute(sql: string, params: readonly unknown[] = []): Promise<void> {
      calls.push({ sql, params });
    },
  };
}

const row: BrowsingEventRow = {
  ts: 1_800_000_000,
  site: "bilibili",
  vid: "BV1",
  title: "标题",
  up: "作者",
  etype: "watch",
  dwell: 90,
  dur: 600,
  topic: 3,
  emo: null,
  valence: null,
  pic: "",
  classifier: "ngram",
};

describe("BROWSING_EVENTS_MIGRATION", () => {
  it("takes a number past every id core-db has shipped or retired", () => {
    expect(BROWSING_EVENTS_MIGRATION.id > "0053").toBe(true);
  });

  it("enforces deduplication in the schema, not in a read-then-write race", () => {
    const unique = BROWSING_EVENTS_MIGRATION.statements.find((statement) =>
      statement.includes("UNIQUE INDEX"),
    );
    expect(unique).toContain("(ts, vid, etype)");
  });

  it("is idempotent, so a partially applied migration can be re-run", () => {
    for (const statement of BROWSING_EVENTS_MIGRATION.statements)
      expect(statement).toContain("IF NOT EXISTS");
  });
});

describe("createBrowsingEventStore", () => {
  it("inserts an event, ignoring a duplicate rather than failing the batch", async () => {
    const sql = fakeSql();
    await createBrowsingEventStore(sql).insert(row);
    expect(sql.calls[0]?.sql).toContain("INSERT OR IGNORE");
    expect(sql.calls[0]?.params).toEqual([
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
    ]);
  });

  it("asks for clicks and watches newest first, bounded", async () => {
    const sql = fakeSql();
    await createBrowsingEventStore(sql).listEngagedSince(100, 2000);
    expect(sql.calls[0]?.sql).toContain("etype <> 'expose'");
    expect(sql.calls[0]?.sql).toContain("ORDER BY ts DESC");
    expect(sql.calls[0]?.params).toEqual([100, 2000]);
  });

  it("reads zero counts from an empty table rather than undefined", async () => {
    expect(await createBrowsingEventStore(fakeSql([])).counts()).toEqual({
      events: 0,
      engaged: 0,
    });
    expect(
      await createBrowsingEventStore(fakeSql([{ events: 10, engaged: null }])).counts(),
    ).toEqual({ events: 10, engaged: 0 });
  });

  it("has no profile before one is saved", async () => {
    expect(await createBrowsingEventStore(fakeSql([])).loadProfile()).toBeNull();
  });

  it("round-trips a profile snapshot", async () => {
    const state = createProfileState();
    state.short[2] = 1.5;
    state.prefs["人工智能"] = 2;
    state.ts = 42;
    state.n = 7;
    const writer = fakeSql();
    await createBrowsingEventStore(writer).saveProfile(state);
    const written = writer.calls[0];
    if (written === undefined) throw new Error("saveProfile issued no statement");
    const [shortJson, longJson, exposeJson, prefsJson, ts, n] = written.params;
    const reader = fakeSql([
      {
        short_json: shortJson,
        long_json: longJson,
        expose_json: exposeJson,
        prefs_json: prefsJson,
        decayed_to: ts,
        event_count: n,
      },
    ]);
    expect(await createBrowsingEventStore(reader).loadProfile()).toEqual(state);
  });

  it("survives a corrupt snapshot with an empty profile instead of throwing", async () => {
    const sql = fakeSql([
      {
        short_json: "{ not json",
        long_json: "null",
        expose_json: '[1,"x",null]',
        prefs_json: "[]",
        decayed_to: null,
        event_count: 0,
      },
    ]);
    const loaded = await createBrowsingEventStore(sql).loadProfile();
    expect(loaded?.short).toEqual([]);
    expect(loaded?.expose).toEqual([1, 0, 0]);
    expect(loaded?.prefs).toEqual({});
  });
});
