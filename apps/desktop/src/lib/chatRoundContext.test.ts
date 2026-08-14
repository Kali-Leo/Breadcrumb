/**
 * Purpose: unit tests for buildFocusContextSystemMessage — no sessions -> null, sessions with
 * no answered station are filtered out, and the session count is capped at 3 (most recent
 * first under the cap, restored to chronological order in the rendered content).
 */
import type { FocusNodeRow, FocusSessionRow } from "@breadcrumb/core-db";
import { afterEach, describe, expect, it, vi } from "vitest";

const listByConversationMock = vi.fn();
const listBySessionMock = vi.fn();

vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({
    focusSessions: { listByConversation: listByConversationMock },
    focusNodes: { listBySession: listBySessionMock },
  })),
}));

const { buildFocusContextSystemMessage } = await import("./chatRoundContext");

afterEach(() => {
  vi.clearAllMocks();
});

function session(id: string, rootLabel: string, createdAt: string): FocusSessionRow {
  return {
    id,
    conversation_id: "conv-1",
    entry_message_id: null,
    root_label: rootLabel,
    created_at: createdAt,
    updated_at: createdAt,
    source_message_id: null,
  };
}

function node(answerText: string): FocusNodeRow {
  return {
    id: "n",
    session_id: "s",
    parent_id: null,
    kind: "word",
    label: "闭包",
    question_text: null,
    answer_text: answerText,
    created_at: "t",
  };
}

describe("buildFocusContextSystemMessage", () => {
  it("returns null when the conversation has no focus sessions", async () => {
    listByConversationMock.mockResolvedValue([]);
    expect(await buildFocusContextSystemMessage("conv-1")).toBeNull();
  });

  it("filters out sessions with no answered station", async () => {
    listByConversationMock.mockResolvedValue([session("s1", "闭包", "t1")]);
    listBySessionMock.mockResolvedValue([node("")]);
    expect(await buildFocusContextSystemMessage("conv-1")).toBeNull();
  });

  it("caps at the 3 most recent answered sessions, in chronological order", async () => {
    listByConversationMock.mockResolvedValue([
      session("s1", "A", "t1"),
      session("s2", "B", "t2"),
      session("s3", "C", "t3"),
      session("s4", "D", "t4"),
    ]);
    listBySessionMock.mockResolvedValue([node("答案")]);

    const message = await buildFocusContextSystemMessage("conv-1");

    expect(message).not.toBeNull();
    expect(message?.role).toBe("system");
    const content = message?.content ?? "";
    expect(content).toContain("学习者此前在本对话里的专注探索");
    expect(content).not.toContain("「A」");
    expect(content.indexOf("「B」")).toBeLessThan(content.indexOf("「C」"));
    expect(content.indexOf("「C」")).toBeLessThan(content.indexOf("「D」"));
  });
});
