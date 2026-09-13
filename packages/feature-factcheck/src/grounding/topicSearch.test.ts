/**
 * Purpose: the question-to-search step, whose absence was a real failure — the evidence layer
 * was built for short extracted claims, and Wikipedia's index answers a whole two-clause
 * question with nothing at all.
 */
import { prefixTopicEntities } from "@breadcrumb/core-retrieval";
import { describe, expect, it, vi } from "vitest";
import type { EvidenceProvider, EvidenceSearchResult } from "../evidence/provider";
import { gatherTopicEvidence, MAX_TOPIC_QUERIES, topicQueries } from "./topicSearch";

describe("topicQueries", () => {
  it("asks the longest clause first, then the whole question", () => {
    // Measured against zh.wikipedia: the two-clause question returns zero hits, the first
    // clause returns 珠穆朗瑪峰 as its first result.
    expect(topicQueries("珠穆朗玛峰有多高，是怎么测出来的")).toEqual([
      "珠穆朗玛峰有多高",
      "珠穆朗玛峰有多高 是怎么测出来的",
    ]);
  });

  it("yields one query for a question with no internal punctuation", () => {
    expect(topicQueries("How tall is Mount Everest")).toEqual(["How tall is Mount Everest"]);
  });

  it("never asks more than two things", () => {
    expect(topicQueries("一，二二二，三三三三，四四四四四").length).toBeLessThanOrEqual(
      MAX_TOPIC_QUERIES,
    );
  });

  it("cuts a paragraph down to a search", () => {
    const query = topicQueries("珠".repeat(400))[0] ?? "";
    expect(query.length).toBe(120);
  });

  it("keeps the question's own punctuation out of the index", () => {
    expect(topicQueries("光合作用是怎么回事？")).toEqual(["光合作用是怎么回事"]);
  });
});

function provider(name: string, byQuery: Record<string, string[]>): EvidenceProvider {
  return {
    name,
    search: vi.fn(
      async (query: string, limit: number): Promise<EvidenceSearchResult> => ({
        items: (byQuery[query] ?? []).slice(0, limit).map((url) => ({
          url,
          title: url,
          snippet: `资料 ${url}`,
          source: name,
        })),
        failed: false,
      }),
    ),
  };
}

describe("gatherTopicEvidence", () => {
  it("spends the budget the earlier query did not use", async () => {
    const source = provider("wikipedia", {
      找不到的问题: [],
      找得到的从句: ["https://example.org/a", "https://example.org/b"],
    });
    const items = await gatherTopicEvidence([source], ["找不到的问题", "找得到的从句"], 4);
    expect(items.map((item) => item.url)).toEqual([
      "https://example.org/a",
      "https://example.org/b",
    ]);
  });

  it("de-duplicates a page both queries found", async () => {
    const source = provider("wikipedia", {
      甲: ["https://example.org/a"],
      乙: ["https://example.org/a", "https://example.org/b"],
    });
    const items = await gatherTopicEvidence([source], ["甲", "乙"], 8);
    expect(items.map((item) => item.url)).toEqual([
      "https://example.org/a",
      "https://example.org/b",
    ]);
  });

  it("stops asking once the budget is full", async () => {
    const source = provider("wikipedia", { 甲: ["https://example.org/a"], 乙: ["x"] });
    await gatherTopicEvidence([source], ["甲", "乙"], 1);
    expect(source.search).toHaveBeenCalledTimes(1);
  });
});

describe("an elliptical follow-up, end to end through the search layer", () => {
  /** A stand-in index that behaves the way a real one does: it matches on the words it is
   * given, so a question with no subject finds nothing. */
  function index(): EvidenceProvider {
    return {
      name: "wikipedia",
      search: vi.fn(async (query: string): Promise<EvidenceSearchResult> => {
        const hit = query.includes("珠穆朗玛峰");
        return {
          items: hit
            ? [
                {
                  url: "https://example.org/everest",
                  title: "珠穆朗玛峰",
                  snippet: "珠穆朗玛峰的高度为 8848.86 米。",
                  source: "wikipedia",
                },
              ]
            : [],
          failed: false,
        };
      }),
    };
  }

  it("finds nothing on its own", async () => {
    const items = await gatherTopicEvidence([index()], topicQueries("那它有多高"), 8);
    expect(items).toEqual([]);
  });

  it("finds the topic's passage once the topic's entity words are in front of it", async () => {
    const rewritten = prefixTopicEntities("那它有多高", ["珠穆朗玛峰", "高度"]);
    const items = await gatherTopicEvidence([index()], topicQueries(rewritten), 8);
    expect(items.map((item) => item.title)).toEqual(["珠穆朗玛峰"]);
    expect(items[0]?.snippet).toContain("8848.86");
  });
});
