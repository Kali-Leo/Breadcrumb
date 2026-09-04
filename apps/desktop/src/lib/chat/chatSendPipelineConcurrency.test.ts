/**
 * Purpose: the send entry's one-round-per-conversation gate. Double-clicking 发送 (or a
 * second window sending into the same conversation) used to start two rounds against one
 * question: two user messages persisted, two answers billed, and the first round's stop
 * button silently re-pointed at the second.
 */
import type { MessageRow } from "@breadcrumb/core-db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSendDeps } from "./chatSendPipeline";

/** Rounds are held open so a second send arrives while the first is still streaming. */
const pendingRounds: Array<() => void> = [];
const runAssistantRound = vi.fn(
  () =>
    new Promise<void>((resolve) => {
      pendingRounds.push(resolve);
    }),
);

function finishEveryRound(): void {
  for (const resolve of pendingRounds.splice(0)) resolve();
}

vi.mock("./chatAssistantRound", () => ({
  runAssistantRound: () => runAssistantRound(),
  CHAT_ROUND_GUARD_COPY: {
    offline: { key: "chat:errors.offline" },
    noApiConfig: { key: "chat:errors.noApiConfig" },
  },
}));

const appendUserMessage = vi.fn(
  async (_repos: unknown, _tree: unknown, conversationId: string, content: string) =>
    ({
      id: `m-${content}`,
      conversation_id: conversationId,
      role: "user",
      content,
      created_at: "2026-09-04T00:00:00.000Z",
      teaching_mode: null,
      parent_id: null,
    }) satisfies MessageRow,
);
vi.mock("./chatSendRound", () => ({
  appendUserMessage: (...args: Parameters<typeof appendUserMessage>) => appendUserMessage(...args),
}));

vi.mock("../platform/db", () => ({ getRepos: async () => ({}) }));
vi.mock("./chatRoundContext", () => ({
  ensureChatConversationId: async () => "conv-new",
}));
vi.mock("./chatTreeActions", () => ({ foldAppendedMessage: () => ({}) }));

vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({
      networkEnabled: true,
      apiConfig: { baseUrl: "u", apiKey: "k", model: "m" },
      featureSwitches: { companionChat: true, companionScript: false, companionMemory: false },
    }),
  },
}));
vi.mock("../../stores/knowledgeStore", () => ({
  useKnowledgeStore: { getState: () => ({ anchoredNodeId: null }) },
}));
vi.mock("../../stores/companionStore", () => ({
  useCompanionStore: {
    getState: () => ({
      checkUserMessageForCrisis: vi.fn(),
      crisisConversationIds: new Set<string>(),
    }),
  },
}));

const { runChatSendPipeline } = await import("./chatSendPipeline");
const { freshChatSession } = await import("./chatSessions");
// Warmed up here so the pipeline's own dynamic imports resolve from the module cache rather
// than racing on first load.
await Promise.all([
  import("../../stores/settingsStore"),
  import("../../stores/knowledgeStore"),
  import("../../stores/companionStore"),
]);

function deps(): ChatSendDeps {
  return {
    activeConversationId: () => "conv-1",
    ensureSession: async () => freshChatSession(false),
    patchSession: vi.fn(),
    putSession: vi.fn(),
    setRoundError: vi.fn(),
    clearDraft: vi.fn(),
    readNewConversationStudyMode: () => false,
    setGlobalMeters: vi.fn(),
    emitMessageSent: vi.fn(),
    emitResponseFinished: vi.fn(),
    isConversationLive: () => true,
  };
}

beforeEach(() => {
  pendingRounds.length = 0;
  runAssistantRound.mockClear();
  appendUserMessage.mockClear();
});

describe("runChatSendPipeline concurrency gate", () => {
  it("ignores a second send into a conversation whose round is still running", async () => {
    const first = runChatSendPipeline(deps(), "第一次", "conv-1");
    await vi.waitFor(() => expect(runAssistantRound).toHaveBeenCalledTimes(1));

    await runChatSendPipeline(deps(), "第二次（手抖）", "conv-1");

    expect(appendUserMessage).toHaveBeenCalledTimes(1);
    expect(runAssistantRound).toHaveBeenCalledTimes(1);

    finishEveryRound();
    await first;
  });

  it("lets the next send through once the round has finished", async () => {
    const first = runChatSendPipeline(deps(), "第一次", "conv-1");
    await vi.waitFor(() => expect(runAssistantRound).toHaveBeenCalledTimes(1));
    finishEveryRound();
    await first;

    const second = runChatSendPipeline(deps(), "第二次", "conv-1");
    await vi.waitFor(() => expect(runAssistantRound).toHaveBeenCalledTimes(2));
    finishEveryRound();
    await second;

    expect(appendUserMessage).toHaveBeenCalledTimes(2);
  });

  it("never blocks a send into a different conversation", async () => {
    const first = runChatSendPipeline(deps(), "甲", "conv-1");
    await vi.waitFor(() => expect(runAssistantRound).toHaveBeenCalledTimes(1));

    // conv-1 is mid-stream; a second window sending into conv-2 must be untouched by it.
    const other = runChatSendPipeline(deps(), "乙", "conv-2");
    await vi.waitFor(() => expect(runAssistantRound).toHaveBeenCalledTimes(2));

    expect(appendUserMessage).toHaveBeenCalledTimes(2);

    finishEveryRound();
    await Promise.all([first, other]);
  });
});
