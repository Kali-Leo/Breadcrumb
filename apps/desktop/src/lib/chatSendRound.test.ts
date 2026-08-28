/**
 * Purpose: unit test for runSendRound's system-message assembly — the stable contract leads
 * (so the provider's prefix cache can hit), the per-round steering lines sit immediately
 * before the round's user turn, and a conversation's prefix stays byte-identical round over
 * round. Everything around the assembly (LLM, DB, metering, naming) is mocked away.
 */

import type { MessageRow } from "@breadcrumb/core-db";
import type { ChatMessage } from "@breadcrumb/core-llm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sentMessages: ChatMessage[][] = [];

vi.mock("@breadcrumb/core-llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@breadcrumb/core-llm")>()),
  createLlmClient: () => ({
    chatStream: (messages: ChatMessage[]) => {
      sentMessages.push([...messages]);
      return Promise.resolve({ content: "答", usage: { inputTokens: 1, outputTokens: 1 } });
    },
  }),
}));

const contractMessages = vi.fn<() => Promise<ChatMessage[]>>();
vi.mock("./companionChatPrompt", () => ({
  buildRoundSystemMessages: () => contractMessages(),
}));

const learnerContext = vi.fn<() => Promise<ChatMessage | null>>();
const focusContext = vi.fn<() => Promise<ChatMessage | null>>();
const anchoredNode = vi.fn<() => Promise<ChatMessage | null>>();
vi.mock("./chatRoundContext", () => ({
  buildLearnerContextSystemMessage: () => learnerContext(),
  buildFocusContextSystemMessage: () => focusContext(),
  buildAnchoredNodeSystemMessage: () => anchoredNode(),
}));

vi.mock("./llmConfig", () => ({ llmConfigFrom: () => ({ model: "test-model" }) }));
vi.mock("./answerLanguageWatch", () => ({
  noteReplyLanguage: vi.fn(),
  shouldUseFirmDirective: () => false,
}));
vi.mock("./chatRoundMetering", () => ({
  recordRoundCost: () => Promise.resolve({ costMicros: 0, currency: "USD" }),
}));
vi.mock("./trailNamingActions", () => ({ refreshConversationAutoTitle: vi.fn() }));
vi.mock("./chatTreeActions", () => ({ resolveSendParentId: () => null }));
vi.mock("../stores/knowledgeStore", () => ({
  useKnowledgeStore: { getState: () => ({ nodes: [] }) },
}));

const { runSendRound } = await import("./chatSendRound");

const repos = {
  messages: { append: vi.fn(async () => {}) },
  conversations: { touch: vi.fn(async () => {}) },
} as unknown as Parameters<typeof runSendRound>[0]["repos"];

function userRow(content: string): MessageRow {
  return {
    id: `m-${content}`,
    conversation_id: "conv-1",
    role: "user",
    content,
    created_at: "2026-08-28T00:00:00.000Z",
    teaching_mode: null,
    parent_id: null,
  };
}

async function send(baseMessages: ChatMessage[], userContent: string): Promise<void> {
  await runSendRound({
    repos,
    activeKind: "chat",
    conversationId: "conv-1",
    userMessage: userRow(userContent),
    baseMessages,
    apiConfig: { baseUrl: "u", apiKey: "k", model: "test-model" },
    companionScriptEnabled: false,
    companionMemoryEnabled: false,
    crisisActive: false,
    studyMode: true,
    onDelta: () => undefined,
  });
}

beforeEach(() => {
  sentMessages.length = 0;
  contractMessages.mockResolvedValue([{ role: "system", content: "CONTRACT" }]);
  learnerContext.mockResolvedValue({ role: "system", content: "LEARNER" });
  focusContext.mockResolvedValue({ role: "system", content: "FOCUS" });
  anchoredNode.mockResolvedValue({ role: "system", content: "ANCHOR" });
});

describe("runSendRound system-message assembly", () => {
  it("puts the contract first and the per-round steering just before the user turn", async () => {
    await send(
      [
        { role: "user", content: "第一问" },
        { role: "assistant", content: "第一答" },
        { role: "user", content: "第二问" },
      ],
      "第二问",
    );

    expect(sentMessages[0]?.map((message) => message.content)).toEqual([
      "CONTRACT",
      "第一问",
      "第一答",
      "LEARNER",
      "FOCUS",
      "ANCHOR",
      "第二问",
    ]);
  });

  it("keeps the contract + prior turns prefix byte-identical when the steering changes", async () => {
    await send([{ role: "user", content: "第一问" }], "第一问");
    learnerContext.mockResolvedValue({ role: "system", content: "LEARNER-CHANGED" });
    await send(
      [
        { role: "user", content: "第一问" },
        { role: "assistant", content: "答" },
        { role: "user", content: "第二问" },
      ],
      "第二问",
    );

    const first = sentMessages[0] ?? [];
    const second = sentMessages[1] ?? [];
    // Round 2's prefix must extend round 1's stable head, not diverge at token 0.
    expect(JSON.stringify(second.slice(0, 1))).toBe(JSON.stringify(first.slice(0, 1)));
    expect(second.slice(0, 2).map((message) => message.content)).toEqual(["CONTRACT", "第一问"]);
  });

  it("omits learner and focus context outside 学习模式 but keeps the anchored node", async () => {
    await runSendRound({
      repos,
      activeKind: "chat",
      conversationId: "conv-1",
      userMessage: userRow("问"),
      baseMessages: [{ role: "user", content: "问" }],
      apiConfig: { baseUrl: "u", apiKey: "k", model: "test-model" },
      companionScriptEnabled: false,
      companionMemoryEnabled: false,
      crisisActive: false,
      studyMode: false,
      onDelta: () => undefined,
    });

    expect(sentMessages[0]?.map((message) => message.content)).toEqual([
      "CONTRACT",
      "ANCHOR",
      "问",
    ]);
  });
});
