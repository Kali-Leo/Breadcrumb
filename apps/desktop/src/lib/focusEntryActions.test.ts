/**
 * Purpose: unit tests for writeFocusEntry — writes the exit record for a session with stations,
 * parents it onto the conversation's newest leaf, backfills entry_message_id, and returns null
 * (writing nothing) for a missing session or one that never grew past its root.
 */
import type { FocusNodeRow, FocusSessionRow, MessageRow } from "@breadcrumb/core-db";
import { afterEach, describe, expect, it, vi } from "vitest";

const getByIdMock = vi.fn();
const listBySessionMock = vi.fn();
const listByConversationMock = vi.fn();
const appendMock = vi.fn();
const touchMock = vi.fn();
const setEntryMessageMock = vi.fn();

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    focusSessions: { getById: getByIdMock, setEntryMessage: setEntryMessageMock },
    focusNodes: { listBySession: listBySessionMock },
    messages: { listByConversation: listByConversationMock, append: appendMock },
    conversations: { touch: touchMock },
  })),
}));

const { writeFocusEntry } = await import("./focusEntryActions");

afterEach(() => {
  vi.clearAllMocks();
});

const session: FocusSessionRow = {
  id: "session-1",
  conversation_id: "conv-1",
  entry_message_id: null,
  root_label: "闭包",
  created_at: "t0",
  updated_at: "t0",
};

function node(partial: Partial<FocusNodeRow> & Pick<FocusNodeRow, "id">): FocusNodeRow {
  return {
    session_id: "session-1",
    parent_id: null,
    kind: "word",
    label: partial.id,
    question_text: null,
    answer_text: "",
    created_at: "t",
    ...partial,
  };
}

function existingMessage(id: string, createdAt: string): MessageRow {
  return {
    id,
    conversation_id: "conv-1",
    role: "user",
    content: "之前的对话",
    created_at: createdAt,
    teaching_mode: null,
    parent_id: null,
  };
}

describe("writeFocusEntry", () => {
  it("writes the record, parents it on the newest leaf, and backfills entry_message_id", async () => {
    getByIdMock.mockResolvedValue(session);
    listBySessionMock.mockResolvedValue([
      node({ id: "root", parent_id: null, label: "闭包" }),
      node({ id: "n2", parent_id: "root", label: "词法环境" }),
    ]);
    listByConversationMock.mockResolvedValue([
      existingMessage("m1", "2026-08-13T10:00:00.000Z"),
      existingMessage("m2", "2026-08-13T10:01:00.000Z"),
    ]);

    const messageId = await writeFocusEntry("session-1");

    expect(messageId).not.toBeNull();
    expect(appendMock).toHaveBeenCalledTimes(1);
    const appended = appendMock.mock.calls[0]?.[0] as MessageRow;
    expect(appended.role).toBe("assistant");
    expect(appended.parent_id).toBe("m2");
    expect(appended.teaching_mode).toBeNull();
    expect(appended.content).toContain("闭包");
    expect(appended.content).toContain("词法环境");
    expect(touchMock).toHaveBeenCalledWith("conv-1", appended.created_at);
    expect(setEntryMessageMock).toHaveBeenCalledWith("session-1", appended.id, appended.created_at);
    expect(messageId).toBe(appended.id);
  });

  it("parents the record on null when the conversation has no prior messages", async () => {
    getByIdMock.mockResolvedValue(session);
    listBySessionMock.mockResolvedValue([node({ id: "root", parent_id: null, label: "闭包" })]);
    listByConversationMock.mockResolvedValue([]);

    await writeFocusEntry("session-1");

    const appended = appendMock.mock.calls[0]?.[0] as MessageRow;
    expect(appended.parent_id).toBeNull();
  });

  it("writes nothing and returns null when the session does not exist", async () => {
    getByIdMock.mockResolvedValue(null);

    const messageId = await writeFocusEntry("missing");

    expect(messageId).toBeNull();
    expect(appendMock).not.toHaveBeenCalled();
    expect(setEntryMessageMock).not.toHaveBeenCalled();
  });

  it("writes nothing and returns null when the session has no stations", async () => {
    getByIdMock.mockResolvedValue(session);
    listBySessionMock.mockResolvedValue([]);

    const messageId = await writeFocusEntry("session-1");

    expect(messageId).toBeNull();
    expect(appendMock).not.toHaveBeenCalled();
    expect(setEntryMessageMock).not.toHaveBeenCalled();
  });
});
