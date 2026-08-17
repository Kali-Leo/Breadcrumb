/**
 * Purpose: unit tests for mmrSelect — per-topic cap enforcement, similar-embedding
 * penalization, and the score-order fallback when embeddings are absent.
 */
import { describe, expect, it } from "vitest";
import { type MmrCandidate, mmrSelect } from "./mmr";

function candidate(overrides: Partial<MmrCandidate<string>>): MmrCandidate<string> {
  return {
    item: overrides.item ?? "item",
    score: overrides.score ?? 0,
    embedding: overrides.embedding ?? null,
    topicLabel: overrides.topicLabel ?? "topic",
    ...overrides,
  };
}

describe("mmrSelect", () => {
  it("caps a topic in the head of the list while sinking its overflow to the tail", () => {
    const items: MmrCandidate<string>[] = [
      candidate({ item: "a1", score: 0.9, topicLabel: "A" }),
      candidate({ item: "a2", score: 0.8, topicLabel: "A" }),
      candidate({ item: "a3", score: 0.7, topicLabel: "A" }),
      candidate({ item: "a4", score: 0.6, topicLabel: "A" }),
      candidate({ item: "b1", score: 0.1, topicLabel: "B" }),
    ];
    const picked = mmrSelect(items, 4, 0.7, 2);
    // The low-scoring other topic still beats the third A into the head of the list…
    expect(picked.indexOf("b1")).toBeLessThan(picked.indexOf("a3"));
    // …but nothing vanishes: remaining budget is filled by the capped overflow.
    expect(picked).toHaveLength(4);
  });

  it("returns every candidate of a mono-topic pool instead of starving the list", () => {
    const items: MmrCandidate<string>[] = [
      candidate({ item: "a1", score: 1, topicLabel: "A" }),
      candidate({ item: "a2", score: 1, topicLabel: "A" }),
    ];
    const picked = mmrSelect(items, 5, 0.7, 1);
    expect(picked).toEqual(["a1", "a2"]);
  });

  it("penalizes a candidate highly similar to an already-selected one", () => {
    const items: MmrCandidate<string>[] = [
      candidate({ item: "seed", score: 1.0, embedding: [1, 0], topicLabel: "A" }),
      // Same embedding as "seed" (cosine similarity 1) with only a small score edge over
      // "distinct" — the 0.3-weighted similarity penalty should outweigh that 0.05 edge.
      candidate({ item: "near-duplicate", score: 0.95, embedding: [1, 0], topicLabel: "B" }),
      candidate({ item: "distinct", score: 0.9, embedding: [0, 1], topicLabel: "C" }),
    ];
    const picked = mmrSelect(items, 2, 0.7, 3);
    expect(picked[0]).toBe("seed");
    expect(picked[1]).toBe("distinct");
  });

  it("falls back to pure score order when no candidates have embeddings", () => {
    const items: MmrCandidate<string>[] = [
      candidate({ item: "x1", score: 0.9, embedding: null, topicLabel: "X" }),
      candidate({ item: "x2", score: 0.8, embedding: null, topicLabel: "Y" }),
      candidate({ item: "x3", score: 0.7, embedding: null, topicLabel: "Z" }),
      candidate({ item: "x4", score: 0.6, embedding: null, topicLabel: "W" }),
    ];
    const picked = mmrSelect(items, 3, 0.7, 5);
    expect(picked).toEqual(["x1", "x2", "x3"]);
  });

  it("still respects the topic cap when falling back to score order", () => {
    const items: MmrCandidate<string>[] = [
      candidate({ item: "a1", score: 0.9, embedding: null, topicLabel: "A" }),
      candidate({ item: "a2", score: 0.8, embedding: null, topicLabel: "A" }),
      candidate({ item: "b1", score: 0.7, embedding: null, topicLabel: "B" }),
      candidate({ item: "a3", score: 0.6, embedding: null, topicLabel: "A" }),
    ];
    const picked = mmrSelect(items, 3, 0.7, 1);
    // Topic A is capped at 1: only a1 survives from it, so b1 fills the second slot and there
    // is no third eligible candidate left (a2/a3 are both excluded by the cap).
    expect(picked.slice(0, 2)).toEqual(["a1", "b1"]);
    expect(picked).toHaveLength(3);
  });

  it("returns items unmodified in order when k exceeds the candidate count", () => {
    const items: MmrCandidate<string>[] = [
      candidate({ item: "a1", score: 0.5, topicLabel: "A" }),
      candidate({ item: "b1", score: 0.9, topicLabel: "B" }),
    ];
    const picked = mmrSelect(items, 10, 0.7, 5);
    expect(picked).toHaveLength(2);
    expect(picked).toContain("a1");
    expect(picked).toContain("b1");
  });
});
