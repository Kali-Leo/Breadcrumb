/**
 * Purpose: unit tests for factcheckStore's per-conversation layering — fill-on-first-visit
 * with a single-flight load, no wipe on switch, and checkMessage resolving its round from
 * the message's OWN conversation (never the active mirror), with a DB fallback.
 */
import type { FactcheckClaimRow, FactcheckRunRow, MessageRow } from "@breadcrumb/core-db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listRunsByConversationMock = vi.fn();
const listClaimsByRunMock = vi.fn();
const recordRunMock = vi.fn();
const listMessagesByConversationMock = vi.fn();
vi.mock("../lib/db", () => ({
  getRepos: vi.fn(async () => ({
    factcheck: {
      listRunsByConversation: listRunsByConversationMock,
      listClaimsByRun: listClaimsByRunMock,
      recordRun: recordRunMock,
    },
    messages: { listByConversation: listMessagesByConversationMock },
  })),
}));

const runFactCheckMock = vi.fn();
vi.mock("@breadcrumb/plugin-factcheck", () => ({
  runFactCheck: runFactCheckMock,
  createDefaultEvidenceProviders: vi.fn(() => []),
}));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("../lib/failureLog", () => ({ recordAiFailure: vi.fn() }));
vi.mock("../lib/metering", () => ({ recordMeteredCall: vi.fn(async () => {}) }));

const messagesForMock = vi.fn();
const emitMock = vi.fn();
vi.mock("./chatStore", () => ({
  appEventBus: { emit: emitMock, on: vi.fn(() => () => {}) },
  useChatStore: { getState: () => ({ messagesFor: messagesForMock }) },
}));
vi.mock("./settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({
      networkEnabled: true,
      apiConfig: { model: "test-model" },
      mainlandNetwork: false,
    }),
  },
}));

const { useFactcheckStore } = await import("./factcheckStore");

function messageRow(id: string, role: "user" | "assistant", conversationId: string): MessageRow {
  return {
    id,
    conversation_id: conversationId,
    role,
    content: `${id}-content`,
    created_at: "2026-08-16T00:00:00.000Z",
    teaching_mode: null,
    parent_id: null,
  };
}

function runRow(id: string, messageId: string, conversationId: string): FactcheckRunRow {
  return { id, message_id: messageId, conversation_id: conversationId, created_at: "t" };
}

function claimRow(runId: string, text: string): FactcheckClaimRow {
  return {
    id: `${runId}-${text}`,
    run_id: runId,
    claim_text: text,
    relationship: "supported",
    reasoning: "reason",
    evidence_json: "[]",
    created_at: "t",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  messagesForMock.mockReturnValue([]);
});

describe("ensureLoaded", () => {
  it("fills a conversation's layer on first visit and serves revisits from cache", async () => {
    listRunsByConversationMock.mockResolvedValue([runRow("r1", "m1", "fill-1")]);
    listClaimsByRunMock.mockResolvedValue([claimRow("r1", "claim-a")]);
    const store = useFactcheckStore.getState();
    await Promise.all([store.ensureLoaded("fill-1"), store.ensureLoaded("fill-1")]);
    expect(listRunsByConversationMock).toHaveBeenCalledTimes(1);
    const layer = useFactcheckStore.getState().claimsByConversation.get("fill-1");
    expect(layer?.get("m1")?.[0]?.text).toBe("claim-a");

    await store.ensureLoaded("fill-1");
    expect(listRunsByConversationMock).toHaveBeenCalledTimes(1);
  });

  it("never wipes another conversation's layer on switch", async () => {
    listRunsByConversationMock.mockResolvedValueOnce([runRow("r1", "m1", "keep-1")]);
    listClaimsByRunMock.mockResolvedValueOnce([claimRow("r1", "kept")]);
    await useFactcheckStore.getState().ensureLoaded("keep-1");
    listRunsByConversationMock.mockResolvedValueOnce([]);
    await useFactcheckStore.getState().ensureLoaded("keep-2");
    const layers = useFactcheckStore.getState().claimsByConversation;
    expect(layers.get("keep-1")?.get("m1")?.[0]?.text).toBe("kept");
    expect(layers.has("keep-2")).toBe(true);
  });
});

describe("checkMessage", () => {
  it("resolves the round from the given conversation's session and lands claims in its layer", async () => {
    messagesForMock.mockReturnValue([
      messageRow("q1", "user", "check-1"),
      messageRow("a1", "assistant", "check-1"),
    ]);
    runFactCheckMock.mockResolvedValue({
      claims: [{ text: "claim", relationship: "supported", reasoning: "r", evidence: [] }],
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    await useFactcheckStore.getState().checkMessage("check-1", "a1");
    expect(messagesForMock).toHaveBeenCalledWith("check-1");
    expect(listMessagesByConversationMock).not.toHaveBeenCalled();
    expect(recordRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ message_id: "a1", conversation_id: "check-1" }),
      expect.any(Array),
    );
    expect(emitMock).toHaveBeenCalledWith(
      "factcheck:finished",
      expect.objectContaining({ conversationId: "check-1", messageId: "a1" }),
    );
    const layer = useFactcheckStore.getState().claimsByConversation.get("check-1");
    expect(layer?.get("a1")?.[0]?.text).toBe("claim");
  });

  it("falls back to the database when the chat session is not loaded", async () => {
    messagesForMock.mockReturnValue([]);
    listMessagesByConversationMock.mockResolvedValue([
      messageRow("q2", "user", "check-2"),
      messageRow("a2", "assistant", "check-2"),
    ]);
    runFactCheckMock.mockResolvedValue({
      claims: [],
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    await useFactcheckStore.getState().checkMessage("check-2", "a2");
    expect(listMessagesByConversationMock).toHaveBeenCalledWith("check-2");
    expect(useFactcheckStore.getState().claimsByConversation.get("check-2")?.get("a2")).toEqual([]);
  });

  it("does nothing when the target message is not an assistant answer", async () => {
    messagesForMock.mockReturnValue([messageRow("q3", "user", "check-3")]);
    await useFactcheckStore.getState().checkMessage("check-3", "q3");
    expect(runFactCheckMock).not.toHaveBeenCalled();
  });
});
