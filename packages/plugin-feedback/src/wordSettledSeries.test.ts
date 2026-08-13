/**
 * Purpose: unit tests for the replayed word-settled series — the empty case, events for
 * lemmas with no known introduction time, and the FSRS stability crossing the settle bar.
 */
import type { DiglotWordEventRow, DiglotWordStateRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { WORD_SETTLED_STABILITY_DAYS } from "./settled";
import { computeWordSettledSeries } from "./wordSettledSeries";

function localIso(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month - 1, day, hour, 0).toISOString();
}

const TODAY = localIso(2026, 8, 13);

function wordState(lemma: string, introducedAtIso: string): DiglotWordStateRow {
  return {
    lemma,
    pair: "zh:en",
    fsrs_json: JSON.stringify({
      stability: 0,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      due: introducedAtIso,
      last_review: undefined,
    }),
    due: introducedAtIso,
    introduced_at: introducedAtIso,
    last_event_at: null,
  };
}

function wordEvent(lemma: string, iso: string, id: string): DiglotWordEventRow {
  return {
    id,
    lemma,
    pair: "zh:en",
    kind: "productive_use",
    message_id: null,
    context_hash: null,
    latency_ms: null,
    created_at: iso,
  };
}

describe("computeWordSettledSeries", () => {
  it("returns an empty-valued, gap-free window for no events or states", () => {
    const series = computeWordSettledSeries([], [], { days: 3, todayIso: TODAY });
    expect(series.every((point) => point.value === 0)).toBe(true);
    expect(series).toHaveLength(3);
  });

  it("ignores events for lemmas with no known introduction time", () => {
    const events = [wordEvent("orphan", localIso(2026, 1, 1), "e1")];
    const series = computeWordSettledSeries(events, [], { days: 3, todayIso: TODAY });
    expect(series.every((point) => point.value === 0)).toBe(true);
  });

  it("counts a word as settled once its replayed stability crosses the bar", () => {
    const introducedAt = localIso(2026, 1, 1);
    const states = [wordState("settles", introducedAt)];
    const events = [
      wordEvent("settles", introducedAt, "e1"),
      wordEvent("settles", localIso(2026, 1, 6), "e2"),
    ];
    const series = computeWordSettledSeries(events, states, {
      days: 12,
      todayIso: localIso(2026, 1, 12),
    });
    const byDate = new Map(series.map((point) => [point.date, point.value]));
    // Two "productive_use" (Easy) reviews five days apart push FSRS stability well past the
    // 30-day settle bar; one review alone does not.
    expect(byDate.get("2026-01-01")).toBe(0);
    expect(byDate.get("2026-01-12")).toBe(1);
    expect(WORD_SETTLED_STABILITY_DAYS).toBe(30);
  });
});
