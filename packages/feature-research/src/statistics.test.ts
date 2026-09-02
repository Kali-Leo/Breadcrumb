/**
 * Purpose: unit tests for every whitelisted StatCall implementation, against an in-memory
 * fake SqlClient keyed by table name — covers each count metric, histograms keeping every
 * bucket now that the local display path carries no disclosure floor, and the explicit
 * `suppressed` result that retention_summary and correlation return below their sample-size
 * floors instead of the sentinel 0.
 */

import type { SqlClient } from "@breadcrumb/core-db";
import { withSequentialTransactions } from "@breadcrumb/core-db";
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
  return withSequentialTransactions({
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
  });
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
  it("keeps every encounters_per_node bucket, so the bars sum to the node count", async () => {
    // A lone outlier used to be silently dropped, leaving a chart whose bars did not add up
    // to the "concepts known" number printed beside it (审计统计分报告差距 4).
    const sightings: { node_id: string; created_at: string }[] = [];
    for (let index = 0; index < 5; index += 1) {
      sightings.push({ node_id: `low-${index}`, created_at: localNoonIso("2026-08-01") });
    }
    for (let index = 0; index < 3; index += 1) {
      sightings.push(
        { node_id: `mid-${index}`, created_at: localNoonIso("2026-08-01") },
        { node_id: `mid-${index}`, created_at: localNoonIso("2026-08-02") },
      );
    }
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
    expect(result.bars).toHaveLength(2);
    expect(result.bars.reduce((sum, bar) => sum + bar.value, 0)).toBe(9);
    expect(result.bars[1]?.value).toBe(1);
  });

  it("labels buckets with catalogue keys, never with wording", async () => {
    const sightings = [{ node_id: "a", created_at: localNoonIso("2026-08-01") }];
    const sql = makeFakeSql({ node_sightings: sightings });
    const result = await executeStatCall(
      { fn: "histogram", metric: "encounters_per_node", bucketCount: 2 },
      sql,
      NOW,
    );
    if (result.kind !== "bars") throw new Error("unreachable");
    expect(result.bars[0]?.label.key).toBe("settings:research.barRange");
    expect(result.bars[0]?.label.params).toEqual({ low: "1.00", high: "1.00" });
  });

  it("keeps every retention_per_node bucket even with only three known nodes", async () => {
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
    if (result.kind !== "bars") throw new Error("unreachable");
    expect(result.bars).toHaveLength(6);
    expect(result.bars.reduce((sum, bar) => sum + bar.value, 0)).toBe(3);
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

  it("always reports all seven weekdays, quiet days included", async () => {
    // 2026-08-01 is a Saturday, 2026-08-02 a Sunday.
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
    if (result.kind !== "bars") throw new Error("unreachable");
    expect(result.bars).toHaveLength(7);
    expect(result.bars.map((bar) => bar.label.key)).toEqual([
      "settings:research.weekdaySunday",
      "settings:research.weekdayMonday",
      "settings:research.weekdayTuesday",
      "settings:research.weekdayWednesday",
      "settings:research.weekdayThursday",
      "settings:research.weekdayFriday",
      "settings:research.weekdaySaturday",
    ]);
    expect(result.bars[0]?.value).toBe(2);
    expect(result.bars[6]?.value).toBe(6);
  });
});

describe("retention_summary", () => {
  it("reports suppressed — never three 0 bars — below the sample-size floor", async () => {
    // Three bars reading 0 are indistinguishable from three genuine zeros, and a learner
    // with two concepts would read them as "you remember nothing" (审计统计分报告差距 3).
    const sightings = [
      { node_id: "a", created_at: NOW.toISOString() },
      { node_id: "b", created_at: NOW.toISOString() },
    ];
    const sql = makeFakeSql({ node_sightings: sightings });
    const result = await executeStatCall({ fn: "retention_summary", threshold: 0.9 }, sql, NOW);
    expect(result).toEqual({ kind: "suppressed", n: 2 });
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
    expect(mean?.label.key).toBe("settings:research.retentionMean");
    expect(median?.label.key).toBe("settings:research.retentionMedian");
    expect(share?.label.key).toBe("settings:research.retentionAboveThreshold");
    for (const bar of result.bars) {
      expect(bar.value).toBeGreaterThanOrEqual(0);
      expect(bar.value).toBeLessThanOrEqual(1);
    }
  });
});

describe("correlation", () => {
  it("reports suppressed — never the sentinel 0 — below the 30-day guard", async () => {
    // 0 is a valid coefficient meaning "these move independently"; printing it for "we do
    // not know" is a research finding nobody computed (审计统计分报告差距 3).
    const dayKeys = buildDayKeys(30, NOW.toISOString());
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
        windowDays: 30,
      },
      sql,
      NOW,
    );
    expect(result).toEqual({ kind: "suppressed", n: 2 });
  });

  it("computes a perfect Pearson coefficient for identical daily patterns", async () => {
    const dayKeys = buildDayKeys(40, NOW.toISOString());
    const pattern = Array.from({ length: 40 }, (_, index) => (index % 5) + 1);
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
        windowDays: 40,
      },
      sql,
      NOW,
    );
    expect(result).toEqual({ kind: "number", value: 1, n: 40 });
  });
});
