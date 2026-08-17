/**
 * Purpose: unit tests for the candidate-item contract — that a well-formed item round-trips
 * unchanged, that the nullable fields really are nullable, and that a batch drops only the
 * entries that fail instead of failing whole.
 */
import { describe, expect, it } from "vitest";
import { type CandidateItem, candidateItemSchema, parseCandidateItems } from "./candidateItem";

const wellFormed: CandidateItem = {
  id: "sspai:https://sspai.com/post/1",
  sourceId: "sspai",
  kind: "article",
  url: "https://sspai.com/post/1",
  title: "一个标题",
  summary: "一段摘要",
  coverUrl: "https://cdn.sspai.com/cover.jpg",
  author: "作者",
  publishedAt: "2026-08-17T03:04:05.000Z",
  upstreamSignal: 0.42,
};

describe("candidateItemSchema", () => {
  it("round-trips a well-formed item unchanged", () => {
    expect(candidateItemSchema.parse(wellFormed)).toEqual(wellFormed);
  });

  it("accepts null cover, author and upstream signal", () => {
    const bare = { ...wellFormed, coverUrl: null, author: null, upstreamSignal: null };
    expect(candidateItemSchema.parse(bare)).toEqual(bare);
  });

  it("rejects an upstream signal outside the normalized range", () => {
    expect(candidateItemSchema.safeParse({ ...wellFormed, upstreamSignal: 1.5 }).success).toBe(
      false,
    );
    expect(candidateItemSchema.safeParse({ ...wellFormed, upstreamSignal: -0.1 }).success).toBe(
      false,
    );
  });

  it("rejects a relative url and an unknown kind", () => {
    expect(candidateItemSchema.safeParse({ ...wellFormed, url: "/post/1" }).success).toBe(false);
    expect(candidateItemSchema.safeParse({ ...wellFormed, kind: "tweet" }).success).toBe(false);
  });

  it("rejects a non-ISO published timestamp", () => {
    expect(
      candidateItemSchema.safeParse({ ...wellFormed, publishedAt: "Sun, 17 Aug 2026 03:04:05 GMT" })
        .success,
    ).toBe(false);
  });
});

describe("parseCandidateItems", () => {
  it("keeps the valid items and counts the rest", () => {
    const result = parseCandidateItems([
      wellFormed,
      { ...wellFormed, id: "sspai:2", title: "" },
      { ...wellFormed, id: "sspai:3" },
      "not an object",
    ]);
    expect(result.items.map((item) => item.id)).toEqual([wellFormed.id, "sspai:3"]);
    expect(result.rejectedCount).toBe(2);
  });
});
