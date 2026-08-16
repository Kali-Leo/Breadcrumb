/**
 * Purpose: unit tests for cardBatchSchema's validation boundaries and buildCardBatchMessages'
 * prompt content, including the starter-mode topic-input suppression.
 */
import { describe, expect, it } from "vitest";
import { buildCardBatchMessages, type CardBatchPromptInput, cardBatchSchema } from "./cardPrompts";

function baseInput(overrides: Partial<CardBatchPromptInput> = {}): CardBatchPromptInput {
  return {
    exploitTopics: ["闭包"],
    exploreTopics: ["拓扑学"],
    graphNeighborTopics: ["递归"],
    recentTitles: ["黑洞简史"],
    knownConcepts: ["万有引力"],
    dislikedTopics: ["占星术"],
    starter: false,
    ...overrides,
  };
}

describe("cardBatchSchema", () => {
  it("accepts a well-formed 12-card batch", () => {
    const cards = Array.from({ length: 12 }, (_, i) => ({
      title: `标题${i}`,
      hook: `一句话钩子${i}`,
      topicLabel: `主题${i}`,
    }));
    const result = cardBatchSchema.parse({ cards });
    expect(result.cards).toHaveLength(12);
  });

  it("accepts a single card (lower bound)", () => {
    const result = cardBatchSchema.parse({
      cards: [{ title: "标题", hook: "钩子", topicLabel: "主题" }],
    });
    expect(result.cards).toHaveLength(1);
  });

  it("rejects an empty card list", () => {
    expect(() => cardBatchSchema.parse({ cards: [] })).toThrow();
  });

  it("rejects more than 12 cards", () => {
    const cards = Array.from({ length: 13 }, (_, i) => ({
      title: `标题${i}`,
      hook: `钩子${i}`,
      topicLabel: `主题${i}`,
    }));
    expect(() => cardBatchSchema.parse({ cards })).toThrow();
  });

  it("rejects a title over 24 characters", () => {
    expect(() =>
      cardBatchSchema.parse({
        cards: [{ title: "一".repeat(25), hook: "钩子", topicLabel: "主题" }],
      }),
    ).toThrow();
  });

  it("rejects a hook over 40 characters", () => {
    expect(() =>
      cardBatchSchema.parse({
        cards: [{ title: "标题", hook: "一".repeat(41), topicLabel: "主题" }],
      }),
    ).toThrow();
  });

  it("rejects an empty title after trimming", () => {
    expect(() =>
      cardBatchSchema.parse({ cards: [{ title: "   ", hook: "钩子", topicLabel: "主题" }] }),
    ).toThrow();
  });

  it("trims whitespace from every field", () => {
    const result = cardBatchSchema.parse({
      cards: [{ title: "  标题  ", hook: "  钩子  ", topicLabel: "  主题  " }],
    });
    expect(result.cards[0]).toEqual({ title: "标题", hook: "钩子", topicLabel: "主题" });
  });
});

describe("buildCardBatchMessages", () => {
  it("returns a system + user message pair", () => {
    const messages = buildCardBatchMessages(baseInput());
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("user");
  });

  it("demands strict JSON with exactly 12 cards in the system prompt", () => {
    const systemContent = buildCardBatchMessages(baseInput())[0]?.content ?? "";
    expect(systemContent).toContain("12");
    expect(systemContent).toContain("JSON");
  });

  it("includes exploit/explore/graphNeighbor topics when not in starter mode", () => {
    const userContent = buildCardBatchMessages(baseInput())[1]?.content ?? "";
    expect(userContent).toContain("闭包");
    expect(userContent).toContain("拓扑学");
    expect(userContent).toContain("递归");
  });

  it("always includes recentTitles regardless of starter mode", () => {
    const nonStarterContent =
      buildCardBatchMessages(baseInput({ starter: false }))[1]?.content ?? "";
    const starterContent = buildCardBatchMessages(baseInput({ starter: true }))[1]?.content ?? "";
    expect(nonStarterContent).toContain("黑洞简史");
    expect(starterContent).toContain("黑洞简史");
  });

  it("always includes knownConcepts regardless of starter mode", () => {
    const nonStarterContent =
      buildCardBatchMessages(baseInput({ starter: false }))[1]?.content ?? "";
    const starterContent = buildCardBatchMessages(baseInput({ starter: true }))[1]?.content ?? "";
    expect(nonStarterContent).toContain("万有引力");
    expect(starterContent).toContain("万有引力");
  });

  it("ignores exploit/explore/graphNeighbor topic content in starter mode", () => {
    const starterContent = buildCardBatchMessages(baseInput({ starter: true }))[1]?.content ?? "";
    expect(starterContent).not.toContain("闭包");
    expect(starterContent).not.toContain("拓扑学");
    expect(starterContent).not.toContain("递归");
  });

  it("asks for cross-domain diversity in starter mode", () => {
    const starterContent = buildCardBatchMessages(baseInput({ starter: true }))[1]?.content ?? "";
    expect(starterContent).toContain("跨领域");
  });
});
