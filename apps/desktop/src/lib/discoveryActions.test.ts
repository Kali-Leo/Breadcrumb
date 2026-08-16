/**
 * Purpose: unit tests for generateBatch — guard blocking (offline/switch-off/no apiConfig,
 * each with the same plain banner reason), starter detection on a truly empty DB, the
 * generated batch's persistence + metering + best-effort embedding, and the plain failure
 * banner when the LLM call itself throws (mocks db repos, settings, chatJson, metering,
 * embeddings, failure log).
 */
import type { DiscoveryCardRow, DiscoveryEventRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import { afterEach, describe, expect, it, vi } from "vitest";

let eventRows: DiscoveryEventRow[] = [];
let cardRows: DiscoveryCardRow[] = [];
let nodeRows: KnowledgeNodeRow[] = [];
let recentTitles: string[] = [];

const insertCardsMock = vi.fn(async (rows: readonly DiscoveryCardRow[]) => {
  cardRows.push(...rows);
});
const setCardEmbeddingMock = vi.fn(async (id: string, embeddingJson: string) => {
  cardRows = cardRows.map((row) =>
    row.id === id ? { ...row, embedding_json: embeddingJson } : row,
  );
});

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    discovery: {
      listAllEvents: async () => eventRows,
      listNewestCards: async (limit: number) => cardRows.slice(0, limit),
      listRecentTitles: async () => recentTitles,
      insertCards: insertCardsMock,
      setCardEmbedding: setCardEmbeddingMock,
    },
    knowledgeNodes: { listAll: async () => nodeRows },
  })),
}));

const apiConfig = {
  baseUrl: "https://api.example.com/v1",
  apiKey: "k",
  model: "deepseek-v4-flash",
};
let settingsState = {
  networkEnabled: true,
  featureSwitches: { discoveryCards: true },
  apiConfig: apiConfig as typeof apiConfig | null,
};
vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: { getState: () => settingsState },
}));

const recordAiFailureMock = vi.fn();
vi.mock("./failureLog", () => ({ recordAiFailure: recordAiFailureMock }));

const recordMeteredCallMock = vi.fn();
vi.mock("./metering", () => ({ recordMeteredCall: recordMeteredCallMock }));

const embedTextsMock = vi.fn();
vi.mock("./embeddings", () => ({ embedTexts: embedTextsMock }));

const chatJsonMock = vi.fn();
vi.mock("@breadcrumb/core-llm", async () => {
  const actual =
    await vi.importActual<typeof import("@breadcrumb/core-llm")>("@breadcrumb/core-llm");
  return { ...actual, chatJson: chatJsonMock };
});

const { generateBatch } = await import("./discoveryActions");

function sampleGeneratedCard(title: string) {
  return { title, hook: `${title} 的一句话钩子`, topicLabel: "示例主题" };
}

afterEach(() => {
  eventRows = [];
  cardRows = [];
  nodeRows = [];
  recentTitles = [];
  insertCardsMock.mockClear();
  setCardEmbeddingMock.mockClear();
  recordAiFailureMock.mockReset();
  recordMeteredCallMock.mockReset();
  embedTextsMock.mockReset();
  chatJsonMock.mockReset();
  settingsState = {
    networkEnabled: true,
    featureSwitches: { discoveryCards: true },
    apiConfig,
  };
});

describe("generateBatch guards", () => {
  it("blocks offline with the plain reason, no LLM call", async () => {
    settingsState.networkEnabled = false;
    const outcome = await generateBatch();
    expect(outcome).toEqual({
      kind: "blocked",
      reason: "翻过的卡片还能读；新卡片需要联网和开关。",
    });
    expect(chatJsonMock).not.toHaveBeenCalled();
  });

  it("blocks when the discoveryCards switch is off, same reason", async () => {
    settingsState.featureSwitches.discoveryCards = false;
    const outcome = await generateBatch();
    expect(outcome).toEqual({
      kind: "blocked",
      reason: "翻过的卡片还能读；新卡片需要联网和开关。",
    });
    expect(chatJsonMock).not.toHaveBeenCalled();
  });

  it("blocks when no API is configured, same reason", async () => {
    settingsState.apiConfig = null;
    const outcome = await generateBatch();
    expect(outcome).toEqual({
      kind: "blocked",
      reason: "翻过的卡片还能读；新卡片需要联网和开关。",
    });
    expect(chatJsonMock).not.toHaveBeenCalled();
  });
});

describe("generateBatch success", () => {
  it("detects starter mode on a truly empty DB and asks for cross-domain diversity", async () => {
    chatJsonMock.mockResolvedValue({
      parsed: { cards: [sampleGeneratedCard("卡片一")] },
      usage: { inputTokens: 10, outputTokens: 20 },
    });
    embedTextsMock.mockResolvedValue(null); // embedding unavailable — batch must still succeed

    const outcome = await generateBatch();
    expect(outcome.kind).toBe("generated");
    expect(chatJsonMock).toHaveBeenCalledTimes(1);
    const messages = chatJsonMock.mock.calls[0]?.[1] as Array<{ content: string }>;
    expect(messages[1]?.content).toContain("全新用户");
    expect(insertCardsMock).toHaveBeenCalledTimes(1);
    expect(recordMeteredCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "discovery-cards", model: apiConfig.model }),
    );
  });

  it("persists cards and their embeddings, in non-starter mode once history exists", async () => {
    eventRows = [
      {
        id: "e1",
        card_id: "old-card",
        topic_label: "天文学",
        kind: "open",
        value_ms: null,
        created_at: "2026-08-10T00:00:00.000Z",
      },
    ];
    cardRows = [
      {
        id: "old-card",
        title: "旧卡片",
        hook: "旧钩子",
        topic_label: "天文学",
        source: "starter",
        body_md: null,
        embedding_json: null,
        batch_id: "b0",
        created_at: "2026-08-10T00:00:00.000Z",
        opened_at: "2026-08-10T00:01:00.000Z",
      },
    ];
    chatJsonMock.mockResolvedValue({
      parsed: { cards: [sampleGeneratedCard("卡片二")] },
      usage: { inputTokens: 5, outputTokens: 5 },
    });
    embedTextsMock.mockResolvedValue([[1, 0, 0]]);

    const outcome = await generateBatch();
    expect(outcome.kind).toBe("generated");
    if (outcome.kind !== "generated") throw new Error("unreachable");
    expect(outcome.cards).toHaveLength(1);
    expect(outcome.cards[0]?.embedding_json).toBe(JSON.stringify([1, 0, 0]));
    expect(outcome.cards[0]?.source).toBe("nearby");
    expect(setCardEmbeddingMock).toHaveBeenCalledTimes(1);

    const messages = chatJsonMock.mock.calls[0]?.[1] as Array<{ content: string }>;
    expect(messages[1]?.content).not.toContain("全新用户");
  });

  it("degrades to the plain retry banner and logs a failure when the LLM call throws", async () => {
    chatJsonMock.mockRejectedValue(new Error("network exploded"));
    const outcome = await generateBatch();
    expect(outcome).toEqual({
      kind: "blocked",
      reason: "这批新卡片没有生成成功。可以稍后再翻一批。",
    });
    expect(recordAiFailureMock).toHaveBeenCalledWith("discovery", expect.any(Error));
    expect(insertCardsMock).not.toHaveBeenCalled();
  });
});
