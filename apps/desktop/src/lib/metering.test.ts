/**
 * Purpose: unit tests for recordMeteredCall — the single llm_calls row writer every metered
 * call site now shares. Covers builtin-price calculation in whichever currency the account
 * is billed in, the inert currency label on an unpriced model's zero-cost row, and the
 * zero-token/non-empty-response under-count flag that writes to ai_failures instead of
 * silently recording a free call.
 */
import { ChatJsonError, type Currency } from "@breadcrumb/core-llm";
import { afterEach, describe, expect, it, vi } from "vitest";

const recordCallMock = vi.fn();
vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({ llmCalls: { record: recordCallMock } })),
}));

const recordAiFailureMock = vi.fn();
vi.mock("./failureLog", () => ({
  recordAiFailure: recordAiFailureMock,
}));

/** Which currency the saved account says it is billed in — the settings picker's answer. */
let accountCurrency: Currency | undefined;
vi.mock("./llmConfig", () => ({
  currentPriceCurrency: () => accountCurrency,
}));

/** Rates halve outside DeepSeek's peak window, so a test that priced at the real clock would
 * pass or fail depending on the hour it ran. Every case here bills at a fixed peak instant
 * (a Monday, 02:00 UTC) unless it moves the clock itself. */
const PEAK_INSTANT = "2026-08-31T02:00:00.000Z";
let clock = PEAK_INSTANT;
vi.mock("./time", () => ({
  newId: () => "test-id",
  nowIso: () => clock,
}));

const { recordFailedCallUsage, recordMeteredCall } = await import("./metering");

afterEach(() => {
  recordCallMock.mockReset();
  recordAiFailureMock.mockReset();
  accountCurrency = undefined;
  clock = PEAK_INSTANT;
});

describe("recordMeteredCall", () => {
  it("prices a builtin model in the currency the account is billed in", async () => {
    accountCurrency = "CNY";
    await recordMeteredCall({
      purpose: "chat",
      model: "deepseek-v4-flash",
      conversationId: "c1",
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    });
    expect(recordCallMock).toHaveBeenCalledTimes(1);
    const row = recordCallMock.mock.calls[0]?.[0];
    expect(row.currency).toBe("CNY");
    expect(row.cost_micros).toBe(Math.round(3 * 1_000_000 + 9 * 1_000_000));
    expect(row.conversation_id).toBe("c1");
    expect(row.purpose).toBe("chat");
  });

  it("prices the same model in USD for an account on the international platform", async () => {
    accountCurrency = "USD";
    await recordMeteredCall({
      purpose: "chat",
      model: "deepseek-v4-flash",
      conversationId: null,
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    });
    const row = recordCallMock.mock.calls[0]?.[0];
    expect(row.currency).toBe("USD");
    expect(row.cost_micros).toBe(Math.round(0.44 * 1_000_000 + 1.32 * 1_000_000));
  });

  it("bills the same call at half price outside the provider's peak window", async () => {
    accountCurrency = "CNY";
    clock = "2026-08-31T12:00:00.000Z"; // same Monday, outside 01-04 and 06-10 UTC
    await recordMeteredCall({
      purpose: "chat",
      model: "deepseek-v4-flash",
      conversationId: null,
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    });
    const row = recordCallMock.mock.calls[0]?.[0];
    expect(row.cost_micros).toBe(Math.round(1.5 * 1_000_000 + 4.5 * 1_000_000));
  });

  it("bills the cached slice of the prompt at the cache-hit rate and records the split", async () => {
    accountCurrency = "CNY";
    await recordMeteredCall({
      purpose: "chat",
      model: "deepseek-v4-flash",
      conversationId: null,
      usage: { inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 900_000 },
    });
    const row = recordCallMock.mock.calls[0]?.[0];
    expect(row.cached_input_tokens).toBe(900_000);
    // 100k fresh at ¥3/M + 900k cached at ¥0.10/M
    expect(row.cost_micros).toBe(Math.round(0.1 * 3 * 1_000_000 + 0.9 * 0.1 * 1_000_000));
  });

  it("costs zero for a model missing from the price table, rather than guessing a rate", async () => {
    accountCurrency = "CNY";
    await recordMeteredCall({
      purpose: "chat",
      model: "some-unlisted-model",
      conversationId: null,
      usage: { inputTokens: 500, outputTokens: 500 },
    });
    const row = recordCallMock.mock.calls[0]?.[0];
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

describe("recordFailedCallUsage", () => {
  const target = { purpose: "knowledge-tree", model: "deepseek-v4-flash", conversationId: "c1" };

  it("records what a failed chatJson call already cost", async () => {
    const error = new ChatJsonError(
      "invalid json",
      { inputTokens: 400, outputTokens: 90 },
      new Error("boom"),
    );
    await recordFailedCallUsage(error, target);

    expect(recordCallMock).toHaveBeenCalledTimes(1);
    const row = recordCallMock.mock.calls[0]?.[0];
    expect(row.input_tokens).toBe(400);
    expect(row.output_tokens).toBe(90);
    expect(row.purpose).toBe("knowledge-tree");
  });

  it("stays quiet for a failure that never reached the provider", async () => {
    await recordFailedCallUsage(new Error("offline"), target);
    await recordFailedCallUsage(
      new ChatJsonError("HTTP 401", { inputTokens: 0, outputTokens: 0 }, new Error("401")),
      target,
    );
    expect(recordCallMock).not.toHaveBeenCalled();
  });
});
