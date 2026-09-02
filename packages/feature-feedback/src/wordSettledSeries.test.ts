/**
 * Purpose: unit tests for the replayed word trend series — the settled count (empty case,
 * unknown-introduction lemmas, stability crossing the settle bar) and the word memory /
 * intuition layers (rated-review gating, the productive-use requirement).
 */
import type { DiglotEventKind, DiglotWordEventRow, DiglotWordStateRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import {
  computeWordLayerTrendSeries,
  computeWordSettledSeries,
  WORD_SETTLED_STABILITY_DAYS,
} from "./wordSettledSeries";

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

function wordEvent(
  lemma: string,
  iso: string,
  id: string,
  kind: DiglotEventKind = "productive_use",
): DiglotWordEventRow {
  return {
    id,
    lemma,
    pair: "zh:en",
    kind,
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

describe("computeWordLayerTrendSeries", () => {
  it("returns a zeroed, gap-free window for no events or states", () => {
    const series = computeWordLayerTrendSeries([], [], { days: 3, todayIso: TODAY });
    expect(series).toHaveLength(3);
    expect(series.every((point) => point.memory === 0 && point.intuition === 0)).toBe(true);
  });

  it("counts memory after a rated review but keeps intuition at 0 without productive use", () => {
    const introducedAt = localIso(2026, 1, 1);
    const states = [wordState("guessed", introducedAt)];
    // A slow correct guess rates Good — memory rises, but the word was never produced.
    const events = [wordEvent("guessed", introducedAt, "e1", "guess_correct")];
    const series = computeWordLayerTrendSeries(events, states, {
      days: 3,
      todayIso: localIso(2026, 1, 3),
    });
    const last = series[series.length - 1];
    expect(last?.memory ?? 0).toBeGreaterThan(0);
    expect(series.every((point) => point.intuition === 0)).toBe(true);
  });

  it("moves the long-stable, productively-used share into intuition", () => {
    const introducedAt = localIso(2026, 1, 1);
    const states = [wordState("settles", introducedAt)];
    // Same scenario the settled test uses: two productive uses push stability past the bar.
    const events = [
      wordEvent("settles", introducedAt, "e1"),
      wordEvent("settles", localIso(2026, 1, 6), "e2"),
    ];
    const series = computeWordLayerTrendSeries(events, states, {
      days: 12,
      todayIso: localIso(2026, 1, 12),
    });
    const byDate = new Map(series.map((point) => [point.date, point]));
    const firstDay = byDate.get("2026-01-01");
    const lastDay = byDate.get("2026-01-12");
    expect(firstDay?.memory ?? 0).toBeGreaterThan(0);
    expect(firstDay?.intuition ?? 0).toBe(0);
    expect(lastDay?.intuition ?? 0).toBeGreaterThan(0);
    // Intuition is a share of memory, never more than it.
    for (const point of series) {
      expect(point.intuition).toBeLessThanOrEqual(point.memory);
    }
  });
});
