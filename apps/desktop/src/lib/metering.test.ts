/**
 * Purpose: unit tests for recordMeteredCall — the single llm_calls row writer every metered
 * call site now shares. Covers builtin-price calculation, the documented USD fallback
 * currency for unknown models, and the zero-token/non-empty-response under-count flag that
 * writes to ai_failures instead of silently recording a free call.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const recordCallMock = vi.fn();
vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({ llmCalls: { record: recordCallMock } })),
}));

const recordAiFailureMock = vi.fn();
vi.mock("./failureLog", () => ({
  recordAiFailure: recordAiFailureMock,
}));

const { recordMeteredCall } = await import("./metering");

afterEach(() => {
  recordCallMock.mockReset();
  recordAiFailureMock.mockReset();
});

describe("recordMeteredCall", () => {
  it("prices a known builtin model at its documented USD rate", async () => {
    await recordMeteredCall({
      purpose: "chat",
      model: "deepseek-v4-flash",
      conversationId: "c1",
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    });
    expect(recordCallMock).toHaveBeenCalledTimes(1);
    const row = recordCallMock.mock.calls[0]?.[0];
    expect(row.currency).toBe("USD");
    expect(row.cost_micros).toBe(Math.round(0.14 * 1_000_000 + 0.28 * 1_000_000));
    expect(row.conversation_id).toBe("c1");
    expect(row.purpose).toBe("chat");
  });

  it("falls back to USD (not CNY) and zero cost for a model missing from the price table", async () => {
    await recordMeteredCall({
      purpose: "chat",
      model: "some-unlisted-model",
      conversationId: null,
      usage: { inputTokens: 500, outputTokens: 500 },
    });
    const row = recordCallMock.mock.calls[0]?.[0];
    expect(row.currency).toBe("USD");
    expect(row.cost_micros).toBe(0);
  });

  it("logs an ai_failures row (purpose metering) when 0/0 tokens come with a non-empty response", async () => {
    await recordMeteredCall({
      purpose: "diglot-weave",
      model: "deepseek-v4-flash",
      conversationId: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      responseHadContent: true,
    });
    // The llm_calls row is still written as-is — the under-count is flagged, not hidden.
    expect(recordCallMock).toHaveBeenCalledTimes(1);
    expect(recordAiFailureMock).toHaveBeenCalledTimes(1);
    expect(recordAiFailureMock.mock.calls[0]?.[0]).toBe("metering");
    expect(String(recordAiFailureMock.mock.calls[0]?.[1])).toContain("diglot-weave");
  });

  it("does not log a failure for 0/0 tokens when the caller can't tell if there was content", async () => {
    await recordMeteredCall({
      purpose: "diglot-weave",
      model: "deepseek-v4-flash",
      conversationId: null,
      usage: { inputTokens: 0, outputTokens: 0 },
    });
    expect(recordAiFailureMock).not.toHaveBeenCalled();
  });

  it("does not log a failure for 0/0 tokens when the response really was empty", async () => {
    await recordMeteredCall({
      purpose: "diglot-weave",
      model: "deepseek-v4-flash",
      conversationId: null,
      usage: { inputTokens: 0, outputTokens: 0 },
      responseHadContent: false,
    });
    expect(recordAiFailureMock).not.toHaveBeenCalled();
  });

  it("does not log a failure when tokens were actually counted", async () => {
    await recordMeteredCall({
      purpose: "chat",
      model: "deepseek-v4-flash",
      conversationId: null,
      usage: { inputTokens: 10, outputTokens: 10 },
      responseHadContent: true,
    });
    expect(recordAiFailureMock).not.toHaveBeenCalled();
  });
});
