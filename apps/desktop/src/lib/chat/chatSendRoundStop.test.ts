/**
 * Purpose: what a stopped round leaves behind. Pressing stop does not un-bill the call — the
 * provider charged the prompt and everything it had already generated — so the round has to
 * persist the partial reply AND record the usage the stream reported before the stop. This
 * used to meter every stopped round as 0.
 */
import type { MessageRow } from "@breadcrumb/core-db";
import type { ChatMessage, TokenUsage } from "@breadcrumb/core-llm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ChatStreamAbortedError } = await import("@breadcrumb/core-llm");

/** What the fake provider does this round: deltas to deliver, then how the round ends. */
interface Script {
  deltas: string[];
  abortWith: Error | null;
  usage: TokenUsage;
  skippedFrames?: number;
}
let script: Script = { deltas: [], abortWith: null, usage: { inputTokens: 0, outputTokens: 0 } };

vi.mock("@breadcrumb/core-llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@breadcrumb/core-llm")>()),
  createLlmClient: () => ({
    chatStream: (_messages: ChatMessage[], onDelta: (text: string) => void) => {
      for (const delta of script.deltas) onDelta(delta);
      if (script.abortWith !== null) return Promise.reject(script.abortWith);
      return Promise.resolve({
        content: script.deltas.join(""),
        usage: script.usage,
        skippedFrames: script.skippedFrames ?? 0,
      });
    },
  }),
}));

vi.mock("../companion/companionChatPrompt", () => ({
  buildRoundSystemMessages: () => Promise.resolve([]),
}));
vi.mock("./chatRoundContext", () => ({
  buildLearnerContextSystemMessage: () => Promise.resolve(null),
  buildFocusContextSystemMessage: () => Promise.resolve(null),
  buildAnchoredNodeSystemMessage: () => Promise.resolve(null),
}));
vi.mock("../platform/llmConfig", () => ({ llmConfigFrom: () => ({ model: "test-model" }) }));
const recordAiFailure = vi.fn(async () => {});
vi.mock("../platform/failureLog", () => ({
  recordAiFailure: (purpose: string, error: unknown) => {
    void purpose;
    void error;
    return recordAiFailure();
  },
}));
vi.mock("../platform/answerLanguageWatch", () => ({
  noteReplyLanguage: vi.fn(),
  shouldUseFirmDirective: () => false,
}));

interface RecordedCall {
  usage: TokenUsage;
  responseHadContent?: boolean;
}
const recordRoundCost = vi.fn(async (_repos: unknown, _params: RecordedCall) => ({
  conversationCost: new Map(),
  todayCost: new Map(),
  conversations: [],
}));
vi.mock("./chatRoundMetering", () => ({
  recordRoundCost: (repos: unknown, params: RecordedCall) => recordRoundCost(repos, params),
}));
vi.mock("../trail/trailNamingActions", () => ({ refreshConversationAutoTitle: vi.fn() }));
vi.mock("./chatTreeActions", () => ({ resolveSendParentId: () => null }));
vi.mock("../../stores/knowledgeStore", () => ({
  useKnowledgeStore: { getState: () => ({ nodes: [] }) },
}));

const { runSendRound } = await import("./chatSendRound");

const appended: MessageRow[] = [];
const repos = {
  messages: {
    append: vi.fn(async (row: MessageRow) => {
      appended.push(row);
    }),
  },
  conversations: { touch: vi.fn(async () => {}) },
} as unknown as Parameters<typeof runSendRound>[0]["repos"];

const userMessage: MessageRow = {
  id: "m-user",
  conversation_id: "conv-1",
  role: "user",
  content: "问",
  created_at: "2026-09-04T00:00:00.000Z",
  teaching_mode: null,
  parent_id: null,
};

function send(): ReturnType<typeof runSendRound> {
  return runSendRound({
    repos,
    activeKind: "chat",
    conversationId: "conv-1",
    userMessage,
    baseMessages: [{ role: "user", content: "问" }],
    apiConfig: { baseUrl: "u", apiKey: "k", model: "test-model" },
    companionScriptEnabled: false,
    companionMemoryEnabled: false,
    crisisActive: false,
    studyMode: false,
    onDelta: () => undefined,
  });
}

beforeEach(() => {
  appended.length = 0;
  recordRoundCost.mockClear();
  recordAiFailure.mockClear();
  script = { deltas: [], abortWith: null, usage: { inputTokens: 0, outputTokens: 0 } };
});

describe("runSendRound when the learner presses stop", () => {
  it("meters the usage the provider reported before the stop", async () => {
    script = {
      deltas: ["一段", "已经生成的回答"],
      usage: { inputTokens: 0, outputTokens: 0 },
      abortWith: new ChatStreamAbortedError("stopped", "一段已经生成的回答", {
        inputTokens: 800,
        outputTokens: 120,
      }),
    };

    const outcome = await send();

    expect(outcome?.stoppedEarly).toBe(true);
    expect(outcome?.assistantMessage.content).toBe("一段已经生成的回答");
    expect(recordRoundCost).toHaveBeenCalledTimes(1);
    expect(recordRoundCost.mock.calls[0]?.[1]).toMatchObject({
      usage: { inputTokens: 800, outputTokens: 120 },
    });
  });

  it("still records the cost when the stop landed before the first delta", async () => {
    script = {
      deltas: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      abortWith: new ChatStreamAbortedError("stopped", "", {
        inputTokens: 640,
        outputTokens: 0,
      }),
    };

    expect(await send()).toBeNull();
    expect(appended).toEqual([]);
    expect(recordRoundCost).toHaveBeenCalledTimes(1);
    expect(recordRoundCost.mock.calls[0]?.[1]).toMatchObject({
      usage: { inputTokens: 640, outputTokens: 0 },
      responseHadContent: false,
    });
  });

  it("records nothing when the stop cost nothing at all", async () => {
    script = {
      deltas: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      abortWith: new ChatStreamAbortedError("stopped", "", { inputTokens: 0, outputTokens: 0 }),
    };

    expect(await send()).toBeNull();
    expect(recordRoundCost).not.toHaveBeenCalled();
  });

  it("survives an abort that carries nothing (a bare DOMException from the fetch layer)", async () => {
    script = {
      deltas: ["半句"],
      usage: { inputTokens: 0, outputTokens: 0 },
      abortWith: new DOMException("stopped", "AbortError"),
    };

    const outcome = await send();

    expect(outcome?.stoppedEarly).toBe(true);
    expect(outcome?.assistantMessage.content).toBe("半句");
    expect(recordRoundCost.mock.calls[0]?.[1]).toMatchObject({
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });

  it("notes skipped SSE frames as a silent degradation, without failing the round", async () => {
    script = {
      deltas: ["完整的回答"],
      usage: { inputTokens: 10, outputTokens: 5 },
      abortWith: null,
      skippedFrames: 2,
    };

    const outcome = await send();

    expect(outcome?.assistantMessage.content).toBe("完整的回答");
    expect(recordAiFailure).toHaveBeenCalledTimes(1);
  });

  it("notes nothing when every frame was readable", async () => {
    script = {
      deltas: ["完整的回答"],
      usage: { inputTokens: 10, outputTokens: 5 },
      abortWith: null,
    };

    await send();

    expect(recordAiFailure).not.toHaveBeenCalled();
  });
});
