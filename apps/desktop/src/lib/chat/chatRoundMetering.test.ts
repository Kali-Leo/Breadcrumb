/**
 * Purpose: unit tests for recordRoundCost — verifies it delegates row construction to
 * metering.ts's recordMeteredCall (the single writer; this file used to hand-roll its own
 * copy with a drifted CNY fallback) while still returning the three cost views chatStore
 * needs.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Repos } from "../platform/db";

const recordMeteredCallMock = vi.fn();
vi.mock("../billing/metering", () => ({
  recordMeteredCall: recordMeteredCallMock,
}));

const { recordRoundCost } = await import("./chatRoundMetering");

type FakeRepos = Pick<Repos, "llmCalls" | "conversations">;

function fakeRepos(): FakeRepos {
  return {
    llmCalls: {
      sumCostForConversation: vi.fn(async () => new Map([["USD", 100]])),
      sumCostSince: vi.fn(async () => new Map([["USD", 200]])),
    },
    conversations: {
      listByKind: vi.fn(async () => []),
    },
  } as unknown as FakeRepos;
}

afterEach(() => {
  recordMeteredCallMock.mockReset();
});

describe("recordRoundCost", () => {
  it("delegates the row write to recordMeteredCall with the round's fields", async () => {
    recordMeteredCallMock.mockResolvedValueOnce(undefined);
    const repos = fakeRepos();

    const result = await recordRoundCost(repos, {
      conversationId: "c1",
      purpose: "chat",
      model: "deepseek-v4-flash",
      usage: { inputTokens: 5, outputTokens: 5 },
    });

    expect(recordMeteredCallMock).toHaveBeenCalledWith({
      purpose: "chat",
      model: "deepseek-v4-flash",
      conversationId: "c1",
      usage: { inputTokens: 5, outputTokens: 5 },
      responseHadContent: undefined,
    });
    expect(result.conversationCost.get("USD")).toBe(100);
    expect(result.todayCost.get("USD")).toBe(200);
    expect(repos.conversations.listByKind).toHaveBeenCalledWith("chat");
  });

  it("forwards responseHadContent through to the shared writer when the caller supplies it", async () => {
    recordMeteredCallMock.mockResolvedValueOnce(undefined);
    const repos = fakeRepos();

    await recordRoundCost(repos, {
      conversationId: "c2",
      purpose: "companion-chat",
      model: "deepseek-v4-pro",
      usage: { inputTokens: 0, outputTokens: 0 },
      responseHadContent: true,
    });

    expect(recordMeteredCallMock.mock.calls[0]?.[0]).toMatchObject({ responseHadContent: true });
  });

  it("still resolves the cost snapshot even though it no longer writes the row itself", async () => {
    recordMeteredCallMock.mockResolvedValueOnce(undefined);
    const repos = fakeRepos();

    const result = await recordRoundCost(repos, {
      conversationId: "c3",
      purpose: "chat",
      model: "unknown-model",
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    expect(result).toEqual({
      conversationCost: new Map([["USD", 100]]),
      todayCost: new Map([["USD", 200]]),
      conversations: [],
    });
  });
});
