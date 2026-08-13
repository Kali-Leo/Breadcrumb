/**
 * Purpose: tests for FSRS training-data construction — production rating replay, first
 * review delta 0, prefix items only ending on day-spanning reviews (vision/09 #1).
 */
import type { DiglotWordEventRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { buildTrainingItems } from "./trainingLog";

function event(
  lemma: string,
  kind: DiglotWordEventRow["kind"],
  daysFromStart: number,
  latencyMs: number | null = null,
): DiglotWordEventRow {
  return {
    id: `${lemma}-${kind}-${daysFromStart}-${Math.random()}`,
    lemma,
    pair: "zh:en",
    kind,
    message_id: null,
    context_hash: null,
    latency_ms: latencyMs,
    created_at: new Date(Date.UTC(2026, 0, 1) + daysFromStart * 86400000).toISOString(),
  };
}

describe("buildTrainingItems", () => {
  it("replays production ratings and emits day-spanning prefix items", () => {
    const events = [
      // day 0: two exposures — the 2nd rates Good (first review, delta 0)
      event("w", "exposure", 0),
      event("w", "exposure", 0),
      // day 3: fast correct guess → Easy, delta 3 → one training item (2 reviews)
      event("w", "guess_correct", 3, 1200),
      // day 3 again: another rated review same day → no additional item terminal
      event("w", "productive_use", 3),
    ];
    const { items, reviewCount } = buildTrainingItems(events);
    expect(reviewCount).toBe(3);
    expect(items).toHaveLength(1);
    expect(items[0]?.reviews).toEqual([
      { rating: 3, delta_t: 0 },
      { rating: 4, delta_t: 3 },
    ]);
  });

  it("ignores unrated events and words with a single review", () => {
    const events = [
      event("a", "audio", 0), // never rated
      event("b", "exposure", 0),
      event("b", "exposure", 0), // one Good review only — no item
    ];
    const { items, reviewCount } = buildTrainingItems(events);
    expect(reviewCount).toBe(1);
    expect(items).toHaveLength(0);
  });
});
