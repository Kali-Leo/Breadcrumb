/**
 * Purpose: unit tests for the memory stream — the relevance tokenizer, the recency x
 * importance x relevance retrieval ranking, the reflection threshold, the importance/
 * reflection Zod contracts, and the local observation-content builder.
 */
import { describe, expect, it } from "vitest";
import {
  buildObservationContent,
  type CompanionMemoryLike,
  ImportanceResultSchema,
  REFLECTION_THRESHOLD,
  ReflectionResultSchema,
  retrieveMemories,
  scoreMemoryRetrieval,
  shouldReflect,
  tokenizeForRelevance,
} from "./memoryStream";

function memory(overrides: Partial<CompanionMemoryLike>): CompanionMemoryLike {
  return {
    id: "m1",
    kind: "observation",
    content: "学习者说递归很难理解",
    importance: 5,
    created_at: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("tokenizeForRelevance", () => {
  it("splits mixed zh/en text into CJK bigrams plus alphanumeric words", () => {
    const tokens = tokenizeForRelevance("学习 Binary Search 二分查找");
    expect(tokens.has("binary")).toBe(true);
    expect(tokens.has("search")).toBe(true);
    expect(tokens.has("学习")).toBe(true);
    expect(tokens.has("二分")).toBe(true);
    expect(tokens.has("分查")).toBe(true);
    expect(tokens.has("查找")).toBe(true);
    expect(tokens.has("习b")).toBe(false); // a CJK run never bridges into an alnum run
  });

  it("lowercases before tokenizing", () => {
    expect(tokenizeForRelevance("Recursion").has("recursion")).toBe(true);
  });

  it("does not bridge bigrams across a non-CJK separator inside CJK text", () => {
    const tokens = tokenizeForRelevance("闭包 abc 递归");
    expect(tokens.has("包递")).toBe(false);
  });
});

describe("scoreMemoryRetrieval", () => {
  const now = "2026-08-13T12:00:00.000Z";

  it("ranks a relevant, recent, important memory above irrelevant/old/trivial ones", () => {
    const relevantRecentImportant = memory({
      id: "good",
      content: "学习者说递归很难理解,尤其是基线条件",
      importance: 9,
      created_at: "2026-08-13T11:00:00.000Z",
    });
    const irrelevant = memory({
      id: "irrelevant",
      content: "伙伴回应今天天气不错",
      importance: 9,
      created_at: "2026-08-13T11:00:00.000Z",
    });
    const old = memory({
      id: "old",
      content: "学习者说递归很难理解,尤其是基线条件",
      importance: 9,
      created_at: "2026-06-01T00:00:00.000Z",
    });
    const trivial = memory({
      id: "trivial",
      content: "学习者说递归很难理解,尤其是基线条件",
      importance: 1,
      created_at: "2026-08-13T11:00:00.000Z",
    });

    const query = "递归 基线条件";
    const goodScore = scoreMemoryRetrieval(relevantRecentImportant, query, now);
    expect(goodScore).toBeGreaterThan(scoreMemoryRetrieval(irrelevant, query, now));
    expect(goodScore).toBeGreaterThan(scoreMemoryRetrieval(old, query, now));
    expect(goodScore).toBeGreaterThan(scoreMemoryRetrieval(trivial, query, now));
  });

  it("decays recency monotonically with elapsed hours", () => {
    const query = "递归";
    const base = memory({ content: "递归递归递归" });
    const oneHourAgo = scoreMemoryRetrieval(
      { ...base, created_at: "2026-08-13T11:00:00.000Z" },
      query,
      now,
    );
    const twoHoursAgo = scoreMemoryRetrieval(
      { ...base, created_at: "2026-08-13T10:00:00.000Z" },
      query,
      now,
    );
    const tenHoursAgo = scoreMemoryRetrieval(
      { ...base, created_at: "2026-08-13T02:00:00.000Z" },
      query,
      now,
    );
    expect(oneHourAgo).toBeGreaterThan(twoHoursAgo);
    expect(twoHoursAgo).toBeGreaterThan(tenHoursAgo);
  });

  it("scores zero relevance when there is no token overlap", () => {
    expect(scoreMemoryRetrieval(memory({ content: "闭包捕获变量" }), "递归", now)).toBe(0);
  });
});

describe("retrieveMemories", () => {
  it("returns top-N by score, newest first on ties", () => {
    const now = "2026-08-13T12:00:00.000Z";
    const older = memory({
      id: "older",
      content: "递归",
      importance: 5,
      created_at: "2026-08-13T09:00:00.000Z",
    });
    const newer = memory({
      id: "newer",
      content: "闭包",
      importance: 5,
      created_at: "2026-08-13T09:00:00.000Z",
    });
    // Same score is impossible without matching tokens/importance/time — force a tie by
    // giving both zero relevance (query matches neither), so score is 0 for both.
    const results = retrieveMemories([older, newer], "不相关查询", now, 5);
    expect(results.map((m) => m.id)).toEqual(["older", "newer"]);
  });

  it("limits to the requested count", () => {
    const now = "2026-08-13T12:00:00.000Z";
    const memories = Array.from({ length: 5 }, (_, index) =>
      memory({ id: `m${index}`, content: "递归", created_at: now }),
    );
    expect(retrieveMemories(memories, "递归", now, 2)).toHaveLength(2);
  });
});

describe("shouldReflect", () => {
  it("is false below the threshold and true at/above it", () => {
    expect(shouldReflect(REFLECTION_THRESHOLD - 1)).toBe(false);
    expect(shouldReflect(REFLECTION_THRESHOLD)).toBe(true);
    expect(shouldReflect(REFLECTION_THRESHOLD + 10)).toBe(true);
  });
});

describe("ImportanceResultSchema", () => {
  it("accepts an in-range integer", () => {
    expect(ImportanceResultSchema.parse({ importance: 7 }).importance).toBe(7);
  });

  it("rejects out-of-range importance", () => {
    expect(() => ImportanceResultSchema.parse({ importance: 0 })).toThrow();
    expect(() => ImportanceResultSchema.parse({ importance: 11 })).toThrow();
    expect(() => ImportanceResultSchema.parse({ importance: 5.5 })).toThrow();
  });
});

describe("ReflectionResultSchema", () => {
  it("accepts 1-3 insights", () => {
    expect(ReflectionResultSchema.parse({ insights: ["洞察一"] }).insights).toHaveLength(1);
  });

  it("rejects more than 3 insights", () => {
    expect(() => ReflectionResultSchema.parse({ insights: ["a", "b", "c", "d"] })).toThrow();
  });

  it("rejects zero insights", () => {
    expect(() => ReflectionResultSchema.parse({ insights: [] })).toThrow();
  });
});

describe("buildObservationContent", () => {
  it("composes both sides", () => {
    expect(buildObservationContent("我不懂闭包", "闭包捕获的是变量本身")).toBe(
      "学习者说:我不懂闭包/伙伴回应:闭包捕获的是变量本身",
    );
  });

  it("truncates each side independently at 200 chars on a code-point boundary", () => {
    const longUser = "学".repeat(250);
    const longAssistant = "答".repeat(300);
    const result = buildObservationContent(longUser, longAssistant);
    const userPart = result.slice("学习者说:".length, result.indexOf("/伙伴回应:"));
    const assistantPart = result.slice(result.indexOf("/伙伴回应:") + "/伙伴回应:".length);
    expect(Array.from(userPart)).toHaveLength(200);
    expect(Array.from(assistantPart)).toHaveLength(200);
  });
});
