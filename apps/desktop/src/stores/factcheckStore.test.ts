/**
 * Purpose: unit tests for factcheckStore's per-conversation layering — fill-on-first-visit
 * with a single-flight load (one batched claim query, not one per run), no wipe on switch,
 * checkMessage resolving its round from the message's OWN conversation (never the active
 * mirror) with a DB fallback, failed evidence providers reaching ai_failures, and a failed
 * call's usage still reaching the ledger.
 */
import type { FactcheckClaimRow, FactcheckRunRow, MessageRow } from "@breadcrumb/core-db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordFailedCallUsage } from "../lib/billing/metering";
import { recordAiFailure } from "../lib/platform/failureLog";

const listRunsByConversationMock = vi.fn();
const listClaimsByRunsMock = vi.fn();
const recordRunMock = vi.fn();
const listMessagesByConversationMock = vi.fn();
vi.mock("../lib/platform/db", () => ({
  getRepos: vi.fn(async () => ({
    factcheck: {
      listRunsByConversation: listRunsByConversationMock,
      listClaimsByRuns: listClaimsByRunsMock,
      recordRun: recordRunMock,
    },
    messages: { listByConversation: listMessagesByConversationMock },
  })),
}));

const runFactCheckMock = vi.fn();
vi.mock("@breadcrumb/feature-factcheck", () => ({
  runFactCheck: runFactCheckMock,
  createDefaultEvidenceProviders: vi.fn(() => []),
}));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("../lib/platform/failureLog", () => ({ recordAiFailure: vi.fn() }));
vi.mock("../lib/billing/metering", () => ({
  recordMeteredCall: vi.fn(async () => {}),
  recordFailedCallUsage: vi.fn(async () => {}),
}));

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
  listClaimsByRunsMock.mockResolvedValue([]);
});

describe("ensureLoaded", () => {
  it("fills a conversation's layer on first visit and serves revisits from cache", async () => {
    listRunsByConversationMock.mockResolvedValue([runRow("r1", "m1", "fill-1")]);
    listClaimsByRunsMock.mockResolvedValue([claimRow("r1", "claim-a")]);
    const store = useFactcheckStore.getState();
    await Promise.all([store.ensureLoaded("fill-1"), store.ensureLoaded("fill-1")]);
    expect(listRunsByConversationMock).toHaveBeenCalledTimes(1);
    const layer = useFactcheckStore.getState().claimsByConversation.get("fill-1");
    expect(layer?.get("m1")?.[0]?.text).toBe("claim-a");

    await store.ensureLoaded("fill-1");
    expect(listRunsByConversationMock).toHaveBeenCalledTimes(1);
  });

  it("loads every run's claims in one batched query, not one query per run", async () => {
    listRunsByConversationMock.mockResolvedValue([
      runRow("r1", "m1", "batch-1"),
      runRow("r2", "m2", "batch-1"),
      runRow("r3", "m3", "batch-1"),
    ]);
    listClaimsByRunsMock.mockResolvedValue([
      claimRow("r1", "one"),
      claimRow("r3", "three"),
      claimRow("r2", "two"),
    ]);

    await useFactcheckStore.getState().ensureLoaded("batch-1");

    expect(listClaimsByRunsMock).toHaveBeenCalledTimes(1);
    expect(listClaimsByRunsMock).toHaveBeenCalledWith(["r1", "r2", "r3"]);
    const layer = useFactcheckStore.getState().claimsByConversation.get("batch-1");
    expect(layer?.get("m1")?.[0]?.text).toBe("one");
    expect(layer?.get("m2")?.[0]?.text).toBe("two");
    expect(layer?.get("m3")?.[0]?.text).toBe("three");
  });

  it("never wipes another conversation's layer on switch", async () => {
    listRunsByConversationMock.mockResolvedValueOnce([runRow("r1", "m1", "keep-1")]);
    listClaimsByRunsMock.mockResolvedValueOnce([claimRow("r1", "kept")]);
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
      failedProviders: [],
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
      failedProviders: [],
    });
    await useFactcheckStore.getState().checkMessage("check-2", "a2");
    expect(listMessagesByConversationMock).toHaveBeenCalledWith("check-2");
    expect(useFactcheckStore.getState().claimsByConversation.get("check-2")?.get("a2")).toEqual([]);
  });

  it("records every failed evidence provider so a source going dark is visible", async () => {
    messagesForMock.mockReturnValue([
      messageRow("q4", "user", "check-4"),
      messageRow("a4", "assistant", "check-4"),
    ]);
    runFactCheckMock.mockResolvedValue({
      claims: [{ text: "claim", relationship: "unavailable", reasoning: "", evidence: [] }],
      usage: { inputTokens: 1, outputTokens: 1 },
      failedProviders: ["bing", "duckduckgo"],
    });

    await useFactcheckStore.getState().checkMessage("check-4", "a4");

    expect(recordAiFailure).toHaveBeenCalledTimes(2);
    expect(recordAiFailure).toHaveBeenCalledWith("factcheck", expect.stringContaining("bing"));
    expect(recordAiFailure).toHaveBeenCalledWith(
      "factcheck",
      expect.stringContaining("duckduckgo"),
    );
  });

  it("bills what a failed extraction call already cost instead of dropping it", async () => {
    messagesForMock.mockReturnValue([
      messageRow("q5", "user", "check-5"),
      messageRow("a5", "assistant", "check-5"),
    ]);
    const failure = new Error("provider gave up");
    runFactCheckMock.mockRejectedValue(failure);

    await useFactcheckStore.getState().checkMessage("check-5", "a5");

    expect(recordFailedCallUsage).toHaveBeenCalledWith(failure, {
      purpose: "factcheck",
      model: "test-model",
      conversationId: "check-5",
    });
  });

  it("does nothing when the target message is not an assistant answer", async () => {
    messagesForMock.mockReturnValue([messageRow("q3", "user", "check-3")]);
    await useFactcheckStore.getState().checkMessage("check-3", "q3");
    expect(runFactCheckMock).not.toHaveBeenCalled();
  });
});
