/**
 * Purpose: unit tests for the launch-time trail summary — one sentence written for
 * yesterday when it had footprints, nothing when the row already exists, when the switch is
 * off, or when nothing was learned, and a silent degrade (no row) when the model fails.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSummaryMock = vi.fn();
const setSummaryMock = vi.fn();
const listSightedBetweenMock = vi.fn();
vi.mock("../platform/db", () => ({
  getRepos: vi.fn(async () => ({
    trailSummaries: { get: getSummaryMock, set: setSummaryMock },
    knowledgeNodes: { listSightedBetween: listSightedBetweenMock },
  })),
}));

const degradeSilentlyMock = vi.fn();
vi.mock("../platform/failureLog", () => ({
  degradeSilently: degradeSilentlyMock,
  recordAiFailure: vi.fn(),
}));
const recordMeteredCallMock = vi.fn(async () => {});
vi.mock("../billing/metering", () => ({
  recordMeteredCall: recordMeteredCallMock,
  recordFailedCallUsage: vi.fn(async () => {}),
}));
vi.mock("../platform/llmConfig", () => ({
  llmConfigFrom: () => ({ baseUrl: "u", apiKey: "k", model: "m", fetchImpl: fetch }),
}));
vi.mock("../platform/time", () => ({ nowIso: () => "2026-09-02T09:00:00.000Z" }));

const settingsState = {
  featureSwitches: { trailSummary: true },
  networkEnabled: true,
  apiConfig: { model: "m" },
};
vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: { getState: () => settingsState },
}));
vi.mock("../../stores/chatStore", () => ({
  appEventBus: { emit: vi.fn(), on: vi.fn(() => () => {}) },
}));
const loadTrailSummariesMock = vi.fn(async () => {});
vi.mock("../../stores/feedbackStore", () => ({
  useFeedbackStore: { getState: () => ({ loadTrailSummaries: loadTrailSummariesMock }) },
}));

const chatJsonMock = vi.fn();
vi.mock("@breadcrumb/core-llm", async () => {
  const actual =
    await vi.importActual<typeof import("@breadcrumb/core-llm")>("@breadcrumb/core-llm");
  return { ...actual, chatJson: chatJsonMock };
});

const { generateYesterdayTrailSummary } = await import("./trailSummaryActions");

/** A launch on the morning of 2 September, local time — yesterday is 1 September. */
const LAUNCH = new Date(2026, 8, 2, 9, 0);

const node: KnowledgeNodeRow = {
  id: "n1",
  parent_id: null,
  label: "闭包",
  summary: "函数携带其词法作用域",
  kind: "concept",
  created_at: "2026-09-01T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  settingsState.featureSwitches.trailSummary = true;
  getSummaryMock.mockResolvedValue(null);
  listSightedBetweenMock.mockResolvedValue([node]);
  chatJsonMock.mockResolvedValue({
    parsed: { summary: "昨天你搞懂了闭包。" },
    usage: { inputTokens: 10, outputTokens: 5 },
  });
});

describe("generateYesterdayTrailSummary", () => {
  it("writes one sentence for yesterday and meters the call", async () => {
    await generateYesterdayTrailSummary(LAUNCH);
    expect(chatJsonMock).toHaveBeenCalledTimes(1);
    expect(setSummaryMock).toHaveBeenCalledWith({
      date: "2026-09-01",
      content: "昨天你搞懂了闭包。",
      created_at: "2026-09-02T09:00:00.000Z",
    });
    expect(recordMeteredCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "trail-summary", model: "m" }),
    );
    expect(loadTrailSummariesMock).toHaveBeenCalledTimes(1);
  });

  it("asks only about yesterday's footprints", async () => {
    await generateYesterdayTrailSummary(LAUNCH);
    const [fromIso, toIso] = listSightedBetweenMock.mock.calls[0] as [string, string];
    expect(new Date(fromIso).getTime()).toBe(new Date(2026, 8, 1).getTime());
    expect(new Date(toIso).getTime()).toBe(new Date(2026, 8, 2).getTime());
  });

  it("does not generate again once yesterday has a row", async () => {
    getSummaryMock.mockResolvedValue({ date: "2026-09-01", content: "已有", created_at: "t" });
    await generateYesterdayTrailSummary(LAUNCH);
    expect(chatJsonMock).not.toHaveBeenCalled();
    expect(setSummaryMock).not.toHaveBeenCalled();
  });

  it("does nothing while the switch is off", async () => {
    settingsState.featureSwitches.trailSummary = false;
    await generateYesterdayTrailSummary(LAUNCH);
    expect(chatJsonMock).not.toHaveBeenCalled();
  });

  it("does nothing on a day without footprints", async () => {
    listSightedBetweenMock.mockResolvedValue([]);
    await generateYesterdayTrailSummary(LAUNCH);
    expect(chatJsonMock).not.toHaveBeenCalled();
    expect(setSummaryMock).not.toHaveBeenCalled();
  });

  it("degrades silently and writes no row when the model fails", async () => {
    chatJsonMock.mockRejectedValue(new Error("boom"));
    await generateYesterdayTrailSummary(LAUNCH);
    expect(setSummaryMock).not.toHaveBeenCalled();
    expect(degradeSilentlyMock).toHaveBeenCalledWith("trail-summary", expect.any(Error));
  });
});
