/**
 * Purpose: unit tests for summarizeFocusLabel — short labels skip the call, a successful call
 * meters under "focus-explain" and returns the trimmed short name, and any failure degrades to
 * null without throwing (mocks chatJson, metering, and failure logging).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const recordAiFailureMock = vi.fn();
vi.mock("./failureLog", () => ({ recordAiFailure: recordAiFailureMock }));

const recordMeteredCallMock = vi.fn();
const recordFailedCallUsageMock = vi.fn();
vi.mock("./metering", () => ({
  recordMeteredCall: recordMeteredCallMock,
  recordFailedCallUsage: recordFailedCallUsageMock,
}));

const chatJsonMock = vi.fn();
vi.mock("@breadcrumb/core-llm", async () => {
  const actual =
    await vi.importActual<typeof import("@breadcrumb/core-llm")>("@breadcrumb/core-llm");
  return { ...actual, chatJson: chatJsonMock };
});

const { summarizeFocusLabel } = await import("./focusLabelSummary");

afterEach(() => {
  recordAiFailureMock.mockReset();
  recordMeteredCallMock.mockReset();
  recordFailedCallUsageMock.mockReset();
  chatJsonMock.mockReset();
});

const apiConfig = { baseUrl: "https://api.example.com/v1", apiKey: "k", model: "m" };

describe("summarizeFocusLabel", () => {
  it("returns null without calling the model when the raw label is already short", async () => {
    const result = await summarizeFocusLabel("闭包", apiConfig, "conv-1");
    expect(result).toBeNull();
    expect(chatJsonMock).not.toHaveBeenCalled();
  });

  it("returns the trimmed short name and meters under focus-explain when the call succeeds", async () => {
    chatJsonMock.mockResolvedValueOnce({
      parsed: { short: " 词法环境 " },
      usage: { inputTokens: 20, outputTokens: 5 },
    });
    const rawLabel = "为什么闭包容易导致内存泄漏这个问题";
    const result = await summarizeFocusLabel(rawLabel, apiConfig, "conv-1");
    expect(result).toBe("词法环境");
    expect(recordMeteredCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: "focus-explain", conversationId: "conv-1", model: "m" }),
    );
  });

  it("returns null and records a failure when the LLM call throws", async () => {
    chatJsonMock.mockRejectedValueOnce(new Error("network blip"));
    const rawLabel = "为什么闭包容易导致内存泄漏这个问题";
    const result = await summarizeFocusLabel(rawLabel, apiConfig, "conv-1");
    expect(result).toBeNull();
    expect(recordAiFailureMock).toHaveBeenCalledWith("focus-explain", expect.any(Error));
    expect(recordMeteredCallMock).not.toHaveBeenCalled();
  });
});
