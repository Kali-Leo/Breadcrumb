/**
 * Purpose: unit tests for the gold-baseline runner — the real data file loads and validates,
 * and direction-accuracy/unrelated-rejection-rate compute correctly against a fake judge
 * response (no network, no API key required).
 */
import { describe, expect, it } from "vitest";
import type { GoldPair } from "./goldBaseline";
import { loadGoldPairs, runGoldBaseline } from "./goldBaseline";

describe("loadGoldPairs", () => {
  it("loads the real gold-prerequisites.json with both relation kinds present", () => {
    const pairs = loadGoldPairs();
    expect(pairs.length).toBeGreaterThan(10);
    expect(pairs.some((p) => p.relation === "requires")).toBe(true);
    expect(pairs.some((p) => p.relation === "unrelated")).toBe(true);
  });
});

describe("runGoldBaseline", () => {
  const pairs: GoldPair[] = [
    { a: "极限", b: "导数", relation: "requires" },
    { a: "导数", b: "极限", relation: "requires" }, // deliberately reversed vs pair 0 to test direction scoring
    { a: "概率", b: "楷书笔画", relation: "unrelated" },
  ];

  it("scores direction accuracy and unrelated-rejection correctly against a fake judge", async () => {
    const fakeFetch = (async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                edges: [
                  {
                    pairId: "g0",
                    relation: "requires",
                    direction: "aToB",
                    weight: null,
                    confidence: 0.9,
                    reasoning: "r",
                  },
                  {
                    pairId: "g1",
                    relation: "requires",
                    direction: "aToB",
                    weight: null,
                    confidence: 0.9,
                    reasoning: "r",
                  },
                  {
                    pairId: "g2",
                    relation: "unrelated",
                    direction: null,
                    weight: null,
                    confidence: 0.8,
                    reasoning: "r",
                  },
                ],
                methodNodes: [],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      })) as typeof fetch;

    const result = await runGoldBaseline(
      {
        baseUrl: "https://api.example.com/v1",
        apiKey: "key",
        model: "test-model",
        fetchImpl: fakeFetch,
      },
      pairs,
    );

    expect(result.totalPairs).toBe(3);
    expect(result.requiresCount).toBe(2);
    expect(result.unrelatedCount).toBe(1);
    // pair g0 (极限->导数, expected aToB) judged aToB -> correct.
    // pair g1 (导数->极限, expected aToB relative to ITS OWN a/b) judged aToB -> also "correct" by
    // this pair's own a/b framing, since g1's a is 导数 and the judge said aToB for g1.
    expect(result.directionAccuracy).toBe(1);
    expect(result.unrelatedRejectionRate).toBe(1);
  });

  it("treats a pairId missing from the judge's response as an unrelated non-judgement", async () => {
    const fakeFetch = (async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify({ edges: [], methodNodes: [] }) } }],
        usage: { prompt_tokens: 5, completion_tokens: 1 },
      })) as typeof fetch;

    const result = await runGoldBaseline(
      {
        baseUrl: "https://api.example.com/v1",
        apiKey: "key",
        model: "test-model",
        fetchImpl: fakeFetch,
      },
      pairs,
    );
    expect(result.directionAccuracy).toBe(0);
    expect(result.unrelatedRejectionRate).toBe(1); // the unrelated pair defaults to "unrelated"
  });
});
