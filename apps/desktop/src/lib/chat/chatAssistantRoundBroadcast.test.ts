/**
 * Purpose: a round whose conversation was deleted while it streamed must not announce itself.
 * chat:responseFinished is what starts extraction, auto-naming and the map refresh; firing it
 * for a conversation that is gone sends all three chasing a row that no longer exists.
 */
import type { MessageRow } from "@breadcrumb/core-db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantRoundDeps } from "./chatAssistantRound";

const assistantMessage: MessageRow = {
  id: "m-assistant",
  conversation_id: "conv-1",
  role: "assistant",
  content: "答",
  created_at: "2026-09-04T00:00:00.000Z",
  teaching_mode: null,
  parent_id: "m-user",
};

vi.mock("./chatSendRound", () => ({
  runSendRound: async () => ({
    assistantMessage,
    cost: { conversationCost: new Map(), todayCost: new Map(), conversations: [] },
    stoppedEarly: false,
  }),
}));
vi.mock("./chatTreeActions", () => ({ foldAppendedMessage: () => ({}) }));
vi.mock("../platform/failureLog", () => ({ recordAiFailure: vi.fn() }));
vi.mock("../platform/db", () => ({ getRepos: async () => ({}) }));
vi.mock("../../stores/diglotStore", () => ({
  useDiglotStore: { getState: () => ({ ensureWovenBeforeReveal: async () => {} }) },
}));

const { runAssistantRound } = await import("./chatAssistantRound");
const { endStreamControl } = await import("./chatStreamControl");
await import("../../stores/diglotStore");

const emitResponseFinished = vi.fn();

function deps(live: boolean): AssistantRoundDeps {
  return {
    patchSession: vi.fn(),
    setGlobalMeters: vi.fn(),
    isConversationLive: () => live,
    emitResponseFinished,
  };
}

function round(live: boolean, conversationId: string): Promise<void> {
  return runAssistantRound(deps(live), {
    repos: {} as never,
    conversationId,
    kind: "chat",
    userMessage: { ...assistantMessage, id: "m-user", role: "user" },
    historyBeforeUser: [],
    apiConfig: { baseUrl: "u", apiKey: "k", model: "m" },
    companionScriptEnabled: false,
    companionMemoryEnabled: false,
    crisisActive: false,
    studyMode: false,
    roundAnchoredNodeId: null,
  });
}

beforeEach(() => {
  emitResponseFinished.mockClear();
});

describe("runAssistantRound broadcast", () => {
  it("announces a finished round of a conversation that still exists", async () => {
    await round(true, "conv-live");
    expect(emitResponseFinished).toHaveBeenCalledTimes(1);
  });

  it("stays silent when the conversation was deleted while the round streamed", async () => {
    await round(false, "conv-deleted");
    expect(emitResponseFinished).not.toHaveBeenCalled();
  });

  it("does not start a second round for a conversation already streaming", async () => {
    const { beginStreamControl } = await import("./chatStreamControl");
    const controller = beginStreamControl("conv-busy");
    if (controller === null) throw new Error("the first round must arm");

    await round(true, "conv-busy");

    expect(emitResponseFinished).not.toHaveBeenCalled();
    endStreamControl("conv-busy", controller);
  });
});
