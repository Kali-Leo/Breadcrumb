/**
 * Purpose: unit tests for focusSessionsStore's per-conversation layering — fill-on-first-visit
 * with an instant cached mirror on revisit, no wipe on switch, and the focus:exited handler
 * writing into the SESSION's conversation layer rather than the active one.
 */
import type { FocusNodeRow, FocusSessionRow } from "@breadcrumb/core-db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listSessionsByConversationMock = vi.fn();
const getSessionByIdMock = vi.fn();
const removeWithNodesMock = vi.fn();
const listNodesBySessionMock = vi.fn();
vi.mock("../lib/platform/db", () => ({
  getRepos: vi.fn(async () => ({
    focusSessions: {
      listByConversation: listSessionsByConversationMock,
      getById: getSessionByIdMock,
      removeWithNodes: removeWithNodesMock,
    },
    focusNodes: { listBySession: listNodesBySessionMock },
  })),
}));

const busHandlersByName = new Map<string, (payload: { sessionId: string }) => void>();
const chatStateMock = { activeConversationId: null as string | null };
vi.mock("./chatStore", () => ({
  appEventBus: {
    on: (name: string, handler: (payload: { sessionId: string }) => void) => {
      busHandlersByName.set(name, handler);
      return () => {};
    },
    emit: vi.fn(),
  },
  useChatStore: { getState: () => chatStateMock },
}));

const { useFocusSessionsStore } = await import("./focusSessionsStore");

function sessionRow(id: string, conversationId: string, sourceMessageId: string): FocusSessionRow {
  return {
    id,
    conversation_id: conversationId,
    entry_message_id: null,
    root_label: `root-${id}`,
    created_at: "2026-08-16T00:00:00.000Z",
    updated_at: "2026-08-16T00:00:00.000Z",
    source_message_id: sourceMessageId,
  };
}

function answeredNode(sessionId: string): FocusNodeRow {
  return {
    id: `${sessionId}-node`,
    session_id: sessionId,
    parent_id: null,
    kind: "word",
    label: "word",
    question_text: null,
    answer_text: "an answer",
    created_at: "2026-08-16T00:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  chatStateMock.activeConversationId = null;
  listNodesBySessionMock.mockImplementation(async (sessionId: string) => [answeredNode(sessionId)]);
});

describe("ensureLoaded", () => {
  it("fills on first visit, mirrors instantly from cache on revisit without refetching", async () => {
    chatStateMock.activeConversationId = "fill-1";
    listSessionsByConversationMock.mockResolvedValue([sessionRow("s1", "fill-1", "m1")]);
    await useFocusSessionsStore.getState().ensureLoaded("fill-1");
    expect(listSessionsByConversationMock).toHaveBeenCalledTimes(1);
    expect(useFocusSessionsStore.getState().sessionsByMessageId.get("m1")).toHaveLength(1);

    // Switch away, then back: the mirror refills from the cached layer, no DB round-trip.
    chatStateMock.activeConversationId = "elsewhere";
    listSessionsByConversationMock.mockResolvedValue([]);
    await useFocusSessionsStore.getState().ensureLoaded("elsewhere");
    expect(useFocusSessionsStore.getState().allSessions).toHaveLength(0);

    chatStateMock.activeConversationId = "fill-1";
    listSessionsByConversationMock.mockClear();
    await useFocusSessionsStore.getState().ensureLoaded("fill-1");
    expect(listSessionsByConversationMock).not.toHaveBeenCalled();
    expect(useFocusSessionsStore.getState().allSessions.map((s) => s.sessionId)).toEqual(["s1"]);
  });

  it("switching conversations never wipes another conversation's layer", async () => {
    chatStateMock.activeConversationId = "keep-1";
    listSessionsByConversationMock.mockResolvedValueOnce([sessionRow("s2", "keep-1", "m2")]);
    await useFocusSessionsStore.getState().ensureLoaded("keep-1");
    listSessionsByConversationMock.mockResolvedValueOnce([]);
    chatStateMock.activeConversationId = "keep-2";
    await useFocusSessionsStore.getState().ensureLoaded("keep-2");
    const layers = useFocusSessionsStore.getState().assemblyByConversation;
    expect(layers.get("keep-1")?.allSessions.map((s) => s.sessionId)).toEqual(["s2"]);
  });

  it("null only empties the mirror (new-conversation view)", async () => {
    await useFocusSessionsStore.getState().ensureLoaded(null);
    expect(useFocusSessionsStore.getState().allSessions).toHaveLength(0);
    expect(listSessionsByConversationMock).not.toHaveBeenCalled();
  });
});

describe("focus:exited", () => {
  function emitFocusExited(sessionId: string): void {
    const handler = busHandlersByName.get("focus:exited");
    if (handler === undefined) throw new Error("focus:exited handler not registered");
    handler({ sessionId });
  }

  it("refreshes the SESSION's conversation layer even when another conversation is open", async () => {
    chatStateMock.activeConversationId = "viewing";
    getSessionByIdMock.mockResolvedValue(sessionRow("s3", "background", "m3"));
    listSessionsByConversationMock.mockResolvedValue([sessionRow("s3", "background", "m3")]);
    emitFocusExited("s3");
    await vi.waitFor(() => {
      const layer = useFocusSessionsStore.getState().assemblyByConversation.get("background");
      expect(layer?.sessionsByMessageId.get("m3")).toHaveLength(1);
    });
    // The active mirror still belongs to the viewed conversation, not the background one.
    expect(listSessionsByConversationMock).toHaveBeenCalledWith("background");
    expect(useFocusSessionsStore.getState().sessionsByMessageId.get("m3")).toBeUndefined();
  });

  it("deletes a session that ended with no answered station instead of refreshing", async () => {
    getSessionByIdMock.mockResolvedValue(sessionRow("s4", "any", "m4"));
    listNodesBySessionMock.mockResolvedValue([
      { ...answeredNode("s4"), answer_text: "" } satisfies FocusNodeRow,
    ]);
    emitFocusExited("s4");
    await vi.waitFor(() => {
      expect(removeWithNodesMock).toHaveBeenCalledWith("s4");
    });
    expect(listSessionsByConversationMock).not.toHaveBeenCalled();
  });
});
