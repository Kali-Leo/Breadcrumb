/**
 * Purpose: unit tests for scoreBatchQuality — gating (empty batch, switch off, offline, no
 * apiConfig) never spends a call, the happy path meters once and maps id → substance, ids the
 * model invented are dropped, items past the batch cap stay unrated, and any error degrades to
 * an empty map plus a logged failure (mocks settings, chatJson, metering, failure log).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const apiConfig = {
  baseUrl: "https://api.example.com/v1",
  apiKey: "k",
  model: "deepseek-v4-flash",
};
let settingsState = {
  networkEnabled: true,
  featureSwitches: { discoveryQualityCheck: true },
  apiConfig: apiConfig as typeof apiConfig | null,
};
vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: { getState: () => settingsState },
}));

const recordAiFailureMock = vi.fn();
vi.mock("./failureLog", () => ({ recordAiFailure: recordAiFailureMock }));

const recordMeteredCallMock = vi.fn();
vi.mock("./metering", () => ({ recordMeteredCall: recordMeteredCallMock }));

const chatJsonMock = vi.fn();
vi.mock("@breadcrumb/core-llm", async () => {
  const actual =
    await vi.importActual<typeof import("@breadcrumb/core-llm")>("@breadcrumb/core-llm");
  return { ...actual, chatJson: chatJsonMock };
});

const { QUALITY_CHECK_BATCH_CAP } = await import("@breadcrumb/plugin-discovery");
const { scoreBatchQuality } = await import("./discoveryQualityCheck");

function item(index: number) {
  return { id: `item-${index}`, title: `标题${index}`, summary: `摘要${index}` };
}

afterEach(() => {
  recordAiFailureMock.mockReset();
  recordMeteredCallMock.mockReset();
  chatJsonMock.mockReset();
  settingsState = {
    networkEnabled: true,
    featureSwitches: { discoveryQualityCheck: true },
    apiConfig,
  };
});

describe("scoreBatchQuality", () => {
  it("returns an empty map without calling the LLM for an empty batch", async () => {
    const scores = await scoreBatchQuality([], null);
    expect(scores.size).toBe(0);
    expect(chatJsonMock).not.toHaveBeenCalled();
  });

  it("returns an empty map and never calls the LLM when the switch is off", async () => {
    settingsState.featureSwitches.discoveryQualityCheck = false;
    const scores = await scoreBatchQuality([item(1)], null);
    expect(scores.size).toBe(0);
    expect(chatJsonMock).not.toHaveBeenCalled();
    expect(recordMeteredCallMock).not.toHaveBeenCalled();
  });

  it("returns an empty map and never calls the LLM while networking is off", async () => {
    settingsState.networkEnabled = false;
    const scores = await scoreBatchQuality([item(1)], null);
    expect(scores.size).toBe(0);
    expect(chatJsonMock).not.toHaveBeenCalled();
  });

  it("returns an empty map and never calls the LLM when there is no API config", async () => {
    settingsState.apiConfig = null;
    const scores = await scoreBatchQuality([item(1)], null);
    expect(scores.size).toBe(0);
    expect(chatJsonMock).not.toHaveBeenCalled();
  });

  it("rates a batch with one metered call and maps id to substance", async () => {
    chatJsonMock.mockResolvedValueOnce({
      parsed: {
        scores: [
          { id: "item-1", substance: 0.8 },
          { id: "item-2", substance: 0.1 },
        ],
      },
      usage: { inputTokens: 300, outputTokens: 40 },
    });

    const scores = await scoreBatchQuality([item(1), item(2)], null);

    expect(scores.get("item-1")).toBe(0.8);
    expect(scores.get("item-2")).toBe(0.1);
    expect(chatJsonMock).toHaveBeenCalledTimes(1);
    expect(recordMeteredCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "discovery-quality-check",
        model: "deepseek-v4-flash",
        conversationId: null,
        responseHadContent: true,
      }),
    );
  });

  it("passes both items' titles to the model and attributes a given conversation", async () => {
    chatJsonMock.mockResolvedValueOnce({
      parsed: { scores: [] },
      usage: { inputTokens: 10, outputTokens: 1 },
    });

    await scoreBatchQuality([item(1), item(2)], "conv-9");

    const [, messages] = chatJsonMock.mock.calls[0] as [unknown, { content: string }[]];
    expect(messages[1]?.content).toContain("标题1");
    expect(messages[1]?.content).toContain("标题2");
    expect(recordMeteredCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conv-9", responseHadContent: false }),
    );
  });

  it("drops scores for ids that were never in the batch", async () => {
    chatJsonMock.mockResolvedValueOnce({
      parsed: {
        scores: [
          { id: "item-1", substance: 0.6 },
          { id: "invented", substance: 0.9 },
        ],
      },
      usage: { inputTokens: 100, outputTokens: 20 },
    });

    const scores = await scoreBatchQuality([item(1)], null);
    expect([...scores.keys()]).toEqual(["item-1"]);
  });

  it("leaves items past the batch cap unrated instead of making a second call", async () => {
    const items = Array.from({ length: QUALITY_CHECK_BATCH_CAP + 3 }, (_, i) => item(i));
    chatJsonMock.mockResolvedValueOnce({
      parsed: {
        scores: [
          { id: "item-0", substance: 0.5 },
          { id: `item-${QUALITY_CHECK_BATCH_CAP + 1}`, substance: 0.5 },
        ],
      },
      usage: { inputTokens: 900, outputTokens: 200 },
    });

    const scores = await scoreBatchQuality(items, null);

    expect(chatJsonMock).toHaveBeenCalledTimes(1);
    expect(scores.has("item-0")).toBe(true);
    expect(scores.has(`item-${QUALITY_CHECK_BATCH_CAP + 1}`)).toBe(false);
  });

  it("returns an empty map and logs a failure when the call throws", async () => {
    chatJsonMock.mockRejectedValueOnce(new Error("network blip"));

    const scores = await scoreBatchQuality([item(1)], null);

    expect(scores.size).toBe(0);
    expect(recordAiFailureMock).toHaveBeenCalledWith("discovery-quality-check", expect.any(Error));
    expect(recordMeteredCallMock).not.toHaveBeenCalled();
  });
});
