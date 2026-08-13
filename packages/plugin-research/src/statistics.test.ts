/**
 * Purpose: unit tests for every whitelisted StatCall implementation, against an in-memory
 * fake SqlClient keyed by table name — covers each count metric, the MIN_CELL_COUNT
 * disclosure floor on histograms and retention_summary, and correlation's small-sample guard.
 */

import type { SqlClient } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { executeStatCall } from "./statistics";
import { buildDayKeys } from "./statisticsSeries";

interface FakeTables {
  knowledge_nodes?: readonly { id: string }[];
  node_sightings?: readonly { node_id: string; created_at: string }[];
  diglot_word_states?: readonly { lemma: string; pair: string; fsrs_json: string }[];
  diglot_word_events?: readonly { created_at: string }[];
  conversations?: readonly { kind: string }[];
  messages?: readonly { created_at: string }[];
}

/** In-memory fake that answers the handful of read-only query shapes statistics.ts issues:
 * `COUNT(*) AS n`, plain `SELECT ... FROM table`, and `WHERE created_at >= ?`. `execute()`
 * throws — statistics.ts must never write. */
function makeFakeSql(tables: FakeTables): SqlClient {
  return {
    select: async <Row>(sql: string, params?: readonly unknown[]): Promise<Row[]> => {
      const tableName = /FROM (\w+)/.exec(sql)?.[1] as keyof FakeTables | undefined;
      let rows: readonly Record<string, unknown>[] = (
        tableName !== undefined ? (tables[tableName] ?? []) : []
      ) as readonly Record<string, unknown>[];
      if (tableName === "conversations" && sql.includes("kind = 'chat'")) {
        rows = rows.filter((row) => row.kind === "chat");
      }
      if (sql.includes("WHERE created_at >= ?")) {
        const since = params?.[0] as string;
        rows = rows.filter((row) => (row.created_at as string) >= since);
      }
      if (sql.includes("COUNT(*) AS n")) {
        return [{ n: rows.length }] as unknown as Row[];
      }
      return rows as unknown as Row[];
    },
    execute: () => {
      throw new Error("statistics.ts must be read-only — execute() should never be called");
    },
  };
}

const NOW = new Date("2026-08-13T04:00:00.000Z");

/** ISO instant at local noon of the given local calendar date — safely inside the day
 * regardless of timezone, and round-trips through localDateKey/buildDayKeys. */
function localNoonIso(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
}

describe("count", () => {
  it("counts concepts_known from knowledge_nodes", async () => {
    const sql = makeFakeSql({ knowledge_nodes: [{ id: "a" }, { id: "b" }, { id: "c" }] });
    const result = await executeStatCall({ fn: "count", metric: "concepts_known" }, sql, NOW);
    expect(result).toEqual({ kind: "number", value: 3, n: 3 });
  });

  it("counts encounters_total from node_sightings", async () => {
    const sql = makeFakeSql({
      node_sightings: [
        { node_id: "a", created_at: localNoonIso("2026-08-01") },
        { node_id: "a", created_at: localNoonIso("2026-08-02") },
      ],
    });
    const result = await executeStatCall({ fn: "count", metric: "encounters_total" }, sql, NOW);
    expect(result).toEqual({ kind: "number", value: 2, n: 2 });
  });

  it("counts distinct local days for active_days", async () => {
    const sql = makeFakeSql({
      node_sightings: [
        { node_id: "a", created_at: localNoonIso("2026-08-01") },
        { node_id: "b", created_at: localNoonIso("2026-08-01") },
        { node_id: "a", created_at: localNoonIso("2026-08-02") },
      ],
    });
    const result = await executeStatCall({ fn: "count", metric: "active_days" }, sql, NOW);
    expect(result).toEqual({ kind: "number", value: 2, n: 2 });
  });

  it("counts woven_words_seen from diglot_word_states rows", async () => {
    const sql = makeFakeSql({
      diglot_word_states: [
        { lemma: "gato", pair: "es:en", fsrs_json: JSON.stringify({ stability: 1 }) },
        { lemma: "perro", pair: "es:en", fsrs_json: JSON.stringify({ stability: 1 }) },
      ],
    });
    const result = await executeStatCall({ fn: "count", metric: "woven_words_seen" }, sql, NOW);
    expect(result).toEqual({ kind: "number", value: 2, n: 2 });
  });

  it("counts only words whose FSRS stability reached the settle bar for woven_words_settled", async () => {
    const sql = makeFakeSql({
      diglot_word_states: [
        { lemma: "settled-1", pair: "es:en", fsrs_json: JSON.stringify({ stability: 45 }) },
        { lemma: "settled-2", pair: "es:en", fsrs_json: JSON.stringify({ stability: 30 }) },
        { lemma: "learning", pair: "es:en", fsrs_json: JSON.stringify({ stability: 5 }) },
      ],
    });
    const result = await executeStatCall({ fn: "count", metric: "woven_words_settled" }, sql, NOW);
    expect(result).toEqual({ kind: "number", value: 2, n: 2 });
  });

  it("counts only kind='chat' conversations for conversations_total", async () => {
    const sql = makeFakeSql({
      conversations: [{ kind: "chat" }, { kind: "chat" }, { kind: "practice" }],
    });
    const result = await executeStatCall({ fn: "count", metric: "conversations_total" }, sql, NOW);
    expect(result).toEqual({ kind: "number", value: 2, n: 2 });
  });
});

describe("histogram", () => {
  it("drops encounters_per_node buckets below MIN_CELL_COUNT", async () => {
    const sightings: { node_id: string; created_at: string }[] = [];
    // 5 nodes seen once, 3 nodes seen twice: all land in the low bucket (8 >= 5, kept).
    for (let index = 0; index < 5; index += 1) {
      sightings.push({ node_id: `low-${index}`, created_at: localNoonIso("2026-08-01") });
    }
    for (let index = 0; index < 3; index += 1) {
      sightings.push(
        { node_id: `mid-${index}`, created_at: localNoonIso("2026-08-01") },
        { node_id: `mid-${index}`, created_at: localNoonIso("2026-08-02") },
      );
    }
    // 1 node seen 10 times: alone in the high bucket (1 < 5, dropped).
    for (let index = 0; index < 10; index += 1) {
      sightings.push({ node_id: "outlier", created_at: localNoonIso("2026-08-01") });
    }
    const sql = makeFakeSql({ node_sightings: sightings });
    const result = await executeStatCall(
      { fn: "histogram", metric: "encounters_per_node", bucketCount: 2 },
      sql,
      NOW,
    );
    expect(result.kind).toBe("bars");
    if (result.kind !== "bars") throw new Error("unreachable");
    expect(result.bars).toHaveLength(1);
    expect(result.bars[0]?.value).toBe(8);
  });

  it("drops retention_per_node buckets below MIN_CELL_COUNT", async () => {
    // Only 3 known nodes, each with one sighting right at `now` — high, recent retention,
    // but too few nodes for the bucket to clear the disclosure floor.
    const sightings = [
      { node_id: "a", created_at: NOW.toISOString() },
      { node_id: "b", created_at: NOW.toISOString() },
      { node_id: "c", created_at: NOW.toISOString() },
    ];
    const sql = makeFakeSql({ node_sightings: sightings });
    const result = await executeStatCall(
      { fn: "histogram", metric: "retention_per_node", bucketCount: 6 },
      sql,
      NOW,
    );
    expect(result).toEqual({ kind: "bars", bars: [] });
  });

  it("keeps a retention_per_node bucket once enough nodes clear the floor", async () => {
    const sightings = Array.from({ length: 6 }, (_, index) => ({
      node_id: `node-${index}`,
      created_at: NOW.toISOString(),
    }));
    const sql = makeFakeSql({ node_sightings: sightings });
    const result = await executeStatCall(
      { fn: "histogram", metric: "retention_per_node", bucketCount: 6 },
      sql,
      NOW,
    );
    expect(result.kind).toBe("bars");
    if (result.kind !== "bars") throw new Error("unreachable");
    const total = result.bars.reduce((sum, bar) => sum + bar.value, 0);
    expect(total).toBe(6);
  });

  it("drops events_per_weekday buckets below MIN_CELL_COUNT", async () => {
    // 2026-08-01 is a Saturday; put 6 events on it (kept) and 2 events on Sunday (dropped).
    const events = [
      ...Array.from({ length: 6 }, () => ({ created_at: localNoonIso("2026-08-01") })),
      ...Array.from({ length: 2 }, () => ({ created_at: localNoonIso("2026-08-02") })),
    ];
    const sql = makeFakeSql({ diglot_word_events: events });
    const result = await executeStatCall(
      { fn: "histogram", metric: "events_per_weekday", bucketCount: 6 },
      sql,
      NOW,
    );
    expect(result.kind).toBe("bars");
    if (result.kind !== "bars") throw new Error("unreachable");
    expect(result.bars).toHaveLength(1);
    expect(result.bars[0]?.value).toBe(6);
  });
});

describe("retention_summary", () => {
  it("suppresses mean/median/share to 0 below MIN_CELL_COUNT known concepts", async () => {
    const sightings = [
      { node_id: "a", created_at: NOW.toISOString() },
      { node_id: "b", created_at: NOW.toISOString() },
    ];
    const sql = makeFakeSql({ node_sightings: sightings });
    const result = await executeStatCall({ fn: "retention_summary", threshold: 0.9 }, sql, NOW);
    expect(result).toEqual({
      kind: "bars",
      bars: [
        { label: "均值", value: 0 },
        { label: "中位数", value: 0 },
        { label: "达标占比", value: 0 },
      ],
    });
  });

  it("aggregates mean/median/share once enough concepts clear the floor", async () => {
    const sightings = Array.from({ length: 6 }, (_, index) => ({
      node_id: `node-${index}`,
      created_at: NOW.toISOString(),
    }));
    const sql = makeFakeSql({ node_sightings: sightings });
    const result = await executeStatCall({ fn: "retention_summary", threshold: 0.9 }, sql, NOW);
    expect(result.kind).toBe("bars");
    if (result.kind !== "bars") throw new Error("unreachable");
    const [mean, median, share] = result.bars;
    expect(mean?.label).toBe("均值");
    expect(median?.label).toBe("中位数");
    expect(share?.label).toBe("达标占比");
    for (const bar of result.bars) {
      expect(bar.value).toBeGreaterThanOrEqual(0);
      expect(bar.value).toBeLessThanOrEqual(1);
    }
  });
});

describe("correlation", () => {
  it("returns value 0 with n = actual days-with-data below the 7-day guard", async () => {
    const dayKeys = buildDayKeys(7, NOW.toISOString());
    const first = dayKeys[0] ?? "";
    const last = dayKeys[dayKeys.length - 1] ?? "";
    const sql = makeFakeSql({
      node_sightings: [
        { node_id: "a", created_at: localNoonIso(first) },
        { node_id: "b", created_at: localNoonIso(first) },
      ],
      diglot_word_events: [{ created_at: localNoonIso(last) }],
    });
    const result = await executeStatCall(
      {
        fn: "correlation",
        xMetric: "daily_encounters",
        yMetric: "daily_word_events",
        windowDays: 7,
      },
      sql,
      NOW,
    );
    expect(result).toEqual({ kind: "number", value: 0, n: 2 });
  });

  it("computes a perfect Pearson coefficient for identical daily patterns", async () => {
    const dayKeys = buildDayKeys(10, NOW.toISOString());
    const pattern = [1, 2, 3, 4, 5, 4, 3, 2, 1, 2];
    const sightings: { node_id: string; created_at: string }[] = [];
    const events: { created_at: string }[] = [];
    dayKeys.forEach((dayKey, index) => {
      const count = pattern[index] ?? 0;
      for (let occurrence = 0; occurrence < count; occurrence += 1) {
        sightings.push({ node_id: `n-${index}-${occurrence}`, created_at: localNoonIso(dayKey) });
        events.push({ created_at: localNoonIso(dayKey) });
      }
    });
    const sql = makeFakeSql({ node_sightings: sightings, diglot_word_events: events });
    const result = await executeStatCall(
      {
        fn: "correlation",
        xMetric: "daily_encounters",
        yMetric: "daily_word_events",
        windowDays: 10,
      },
      sql,
      NOW,
    );
    expect(result).toEqual({ kind: "number", value: 1, n: 10 });
  });
});
