/**
 * Purpose: implementations of the spec 036 whitelisted statistic functions — read-only
 * aggregate SQL plus the MIN_CELL_COUNT disclosure floor and plugin-memory's FSRS retention
 * math. Nothing here ever executes a mutating statement.
 * Main exports: executeStatCall.
 */
import type { NodeSightingRow, SqlClient } from "@breadcrumb/core-db";
import { computeRetentionByNode } from "@breadcrumb/plugin-memory";
import {
  buildDayKeys,
  buildEqualWidthHistogram,
  buildWeekdayHistogram,
  fetchDailyCounts,
  localDateKey,
  pearsonCorrelation,
  roundTo3,
  windowStartIso,
} from "./statisticsSeries";
import { MIN_CELL_COUNT, type StatResult } from "./statResults";
import type { StatCall } from "./taskSchema";

/** The same settle bar plugin-feedback's settled.ts uses (spec 035 #7). Kept as a local
 * literal rather than an import: this package cannot depend on plugin-diglot-weave (not in
 * package.json — the plugin bus keeps research read-only and dependency-minimal), and only
 * the bare `stability` number is needed, not full ts-fsrs Card revival. */
const WORD_SETTLED_STABILITY_DAYS = 30;

/** Reads just the `stability` field out of a serialized ts-fsrs Card. */
function stabilityFromFsrsJson(fsrsJson: string): number {
  return (JSON.parse(fsrsJson) as { stability: number }).stability;
}

/** Runs a `SELECT COUNT(*) AS n ...` and wraps it as a number result whose `n` mirrors the
 * count itself — shared by every count metric backed by a single aggregate query. */
async function selectCount(sql: SqlClient, query: string): Promise<StatResult> {
  const rows = await sql.select<{ n: number }>(query);
  const value = rows[0]?.n ?? 0;
  return { kind: "number", value, n: value };
}

async function executeCount(
  metric: Extract<StatCall, { fn: "count" }>["metric"],
  sql: SqlClient,
): Promise<StatResult> {
  switch (metric) {
    case "concepts_known":
      return selectCount(sql, "SELECT COUNT(*) AS n FROM knowledge_nodes");
    case "encounters_total":
      return selectCount(sql, "SELECT COUNT(*) AS n FROM node_sightings");
    case "active_days": {
      const rows = await sql.select<{ created_at: string }>(
        "SELECT created_at FROM node_sightings",
      );
      const days = new Set(rows.map((row) => localDateKey(row.created_at)));
      return { kind: "number", value: days.size, n: days.size };
    }
    case "woven_words_seen":
      return selectCount(sql, "SELECT COUNT(*) AS n FROM diglot_word_states");
    case "woven_words_settled": {
      const rows = await sql.select<{ fsrs_json: string }>(
        "SELECT fsrs_json FROM diglot_word_states",
      );
      const value = rows.filter(
        (row) => stabilityFromFsrsJson(row.fsrs_json) >= WORD_SETTLED_STABILITY_DAYS,
      ).length;
      return { kind: "number", value, n: value };
    }
    case "conversations_total":
      return selectCount(sql, "SELECT COUNT(*) AS n FROM conversations WHERE kind = 'chat'");
  }
}

async function executeHistogram(
  call: Extract<StatCall, { fn: "histogram" }>,
  sql: SqlClient,
  now: Date,
): Promise<StatResult> {
  switch (call.metric) {
    case "encounters_per_node": {
      const rows = await sql.select<{ node_id: string }>("SELECT node_id FROM node_sightings");
      const countsByNode = new Map<string, number>();
      for (const row of rows) {
        countsByNode.set(row.node_id, (countsByNode.get(row.node_id) ?? 0) + 1);
      }
      return {
        kind: "bars",
        bars: buildEqualWidthHistogram([...countsByNode.values()], call.bucketCount),
      };
    }
    case "retention_per_node": {
      const sightings = await sql.select<NodeSightingRow>("SELECT * FROM node_sightings");
      const retentionByNode = computeRetentionByNode(sightings, now.toISOString());
      const bars = buildEqualWidthHistogram(
        [...retentionByNode.values()],
        call.bucketCount,
        [0, 1],
      );
      return { kind: "bars", bars };
    }
    case "events_per_weekday": {
      const rows = await sql.select<{ created_at: string }>(
        "SELECT created_at FROM diglot_word_events",
      );
      return { kind: "bars", bars: buildWeekdayHistogram(rows.map((row) => row.created_at)) };
    }
  }
}

/** Aggregate FSRS retrievability across every node with at least one sighting: mean,
 * median, and the share at/above `threshold`. Below MIN_CELL_COUNT known concepts the three
 * values are suppressed to 0 — the same disclosure floor histograms enforce per-bucket. */
async function executeRetentionSummary(
  call: Extract<StatCall, { fn: "retention_summary" }>,
  sql: SqlClient,
  now: Date,
): Promise<StatResult> {
  const sightings = await sql.select<NodeSightingRow>("SELECT * FROM node_sightings");
  const values = [...computeRetentionByNode(sightings, now.toISOString()).values()];
  if (values.length < MIN_CELL_COUNT) {
    return {
      kind: "bars",
      bars: [
        { label: "均值", value: 0 },
        { label: "中位数", value: 0 },
        { label: "达标占比", value: 0 },
      ],
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const midIndex = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[midIndex - 1] ?? 0) + (sorted[midIndex] ?? 0)) / 2
      : (sorted[midIndex] ?? 0);
  const share = values.filter((value) => value >= call.threshold).length / values.length;
  return {
    kind: "bars",
    bars: [
      { label: "均值", value: roundTo3(mean) },
      { label: "中位数", value: roundTo3(median) },
      { label: "达标占比", value: roundTo3(share) },
    ],
  };
}

/** Below this many local days actually carrying data, a Pearson coefficient is too easily a
 * small-sample artifact — the call reports 0 instead of a spurious number. */
const CORRELATION_MIN_DAYS_WITH_DATA = 7;

/** Pearson correlation between two per-day series over the trailing `windowDays` local days. */
async function executeCorrelation(
  call: Extract<StatCall, { fn: "correlation" }>,
  sql: SqlClient,
  now: Date,
): Promise<StatResult> {
  const nowIso = now.toISOString();
  const dayKeys = buildDayKeys(call.windowDays, nowIso);
  const sinceIso = windowStartIso(call.windowDays, nowIso);
  const xs = await fetchDailyCounts(call.xMetric, sql, dayKeys, sinceIso);
  const ys = await fetchDailyCounts(call.yMetric, sql, dayKeys, sinceIso);
  const daysWithData = dayKeys.filter(
    (_, index) => (xs[index] ?? 0) > 0 || (ys[index] ?? 0) > 0,
  ).length;
  if (daysWithData < CORRELATION_MIN_DAYS_WITH_DATA) {
    return { kind: "number", value: 0, n: daysWithData };
  }
  return { kind: "number", value: roundTo3(pearsonCorrelation(xs, ys)), n: dayKeys.length };
}

/** Dispatches one whitelisted StatCall to its implementation. Every branch only issues
 * SELECTs — this is the sole entry point statistics execution goes through (spec 036). */
export async function executeStatCall(
  call: StatCall,
  sql: SqlClient,
  now: Date,
): Promise<StatResult> {
  switch (call.fn) {
    case "count":
      return executeCount(call.metric, sql);
    case "histogram":
      return executeHistogram(call, sql, now);
    case "retention_summary":
      return executeRetentionSummary(call, sql, now);
    case "correlation":
      return executeCorrelation(call, sql, now);
  }
}
