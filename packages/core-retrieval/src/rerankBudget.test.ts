/**
 * Purpose: the depth follows the machine — a fast one reads the whole pool, a slow one reads
 * what two seconds allow, and neither reads fewer than the passages that will be shown.
 */
import { describe, expect, it } from "vitest";
import { RERANK_DEPTH } from "./constants";
import {
  createRerankClock,
  RERANK_BUDGET_MS,
  RERANK_FIRST_DEPTH,
  RERANK_MIN_DEPTH,
  rerankDepthFor,
} from "./rerankBudget";

describe("rerankDepthFor", () => {
  it("reads the whole pool where a pair costs milliseconds", () => {
    expect(rerankDepthFor(2)).toBe(RERANK_DEPTH);
  });

  it("reads what fits in the budget on a laptop", () => {
    expect(rerankDepthFor(100)).toBe(20);
    expect(rerankDepthFor(125)).toBe(16);
  });

  it("never reads fewer than the passages that will be shown", () => {
    expect(rerankDepthFor(1000)).toBe(RERANK_MIN_DEPTH);
  });

  it("guesses a depth inside the budget before anything was measured", () => {
    expect(rerankDepthFor(null)).toBe(RERANK_FIRST_DEPTH);
    expect(RERANK_FIRST_DEPTH * 200).toBe(RERANK_BUDGET_MS);
  });
});

describe("createRerankClock", () => {
  it("learns the machine's speed from what calls cost", () => {
    const clock = createRerankClock();
    expect(clock.msPerPair()).toBeNull();
    clock.record(16, 3200);
    expect(clock.msPerPair()).toBe(200);
    expect(clock.depth()).toBe(10);
    clock.record(10, 500);
    expect(clock.msPerPair()).toBe(125);
    expect(clock.depth()).toBe(16);
  });

  it("learns nothing from a call that read nothing", () => {
    const clock = createRerankClock();
    clock.record(0, 100);
    expect(clock.depth()).toBe(RERANK_FIRST_DEPTH);
  });

  it("starts from an earlier session's measurement and reports each new one", () => {
    const seen: number[] = [];
    const clock = createRerankClock({ initialMsPerPair: 100, onEstimate: (ms) => seen.push(ms) });
    expect(clock.depth()).toBe(20);
    clock.record(20, 6000);
    expect(seen).toEqual([200]);
    expect(createRerankClock({ initialMsPerPair: Number.NaN }).depth()).toBe(RERANK_FIRST_DEPTH);
  });
});
