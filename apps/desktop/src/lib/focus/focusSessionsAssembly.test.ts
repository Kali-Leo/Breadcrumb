/**
 * Purpose: unit tests for buildFocusSessionAssembly — legacy entry-message mapping, badge
 * grouping by source message, the answered-only filter, and newest-first bar ordering.
 */
import type { FocusNodeRow, FocusSessionRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { buildFocusSessionAssembly } from "./focusSessionsAssembly";

function session(partial: Partial<FocusSessionRow> & Pick<FocusSessionRow, "id">): FocusSessionRow {
  return {
    conversation_id: "conv-1",
    entry_message_id: null,
    root_label: partial.id,
    created_at: "2026-08-14T10:00:00.000Z",
    updated_at: "2026-08-14T10:00:00.000Z",
    source_message_id: null,
    ...partial,
  };
}

function node(answerText: string): FocusNodeRow {
  return {
    id: "n",
    session_id: "s",
    parent_id: null,
    kind: "word",
    label: "n",
    question_text: null,
    answer_text: answerText,
    created_at: "t",
  };
}

describe("buildFocusSessionAssembly", () => {
  it("keeps the legacy entry_message_id map regardless of answer state", () => {
    const sessions = [session({ id: "s1", entry_message_id: "m1" })];
    const result = buildFocusSessionAssembly(sessions, new Map([["s1", []]]));
    expect(result.entrySessionByMessageId.get("m1")).toBe("s1");
    expect(result.allSessions).toHaveLength(0);
  });

  it("excludes sessions with no answered station from badges and the bar", () => {
    const sessions = [session({ id: "s1", source_message_id: "m1" })];
    const result = buildFocusSessionAssembly(sessions, new Map([["s1", [node("")]]]));
    expect(result.sessionsByMessageId.size).toBe(0);
    expect(result.allSessions).toHaveLength(0);
  });

  it("groups answered sessions under their source message and counts answers", () => {
    const sessions = [
      session({ id: "s1", root_label: "闭包", source_message_id: "m1" }),
      session({ id: "s2", root_label: "递归", source_message_id: "m1" }),
    ];
    const nodesBySession = new Map([
      ["s1", [node("答案一"), node("")]],
      ["s2", [node("答案二")]],
    ]);
    const result = buildFocusSessionAssembly(sessions, nodesBySession);
    expect(result.sessionsByMessageId.get("m1")).toEqual([
      { sessionId: "s1", rootLabel: "闭包", answeredCount: 1 },
      { sessionId: "s2", rootLabel: "递归", answeredCount: 1 },
    ]);
  });

  it("omits sessions with a null source_message_id from the badge map but keeps them in allSessions", () => {
    const sessions = [session({ id: "s1", source_message_id: null })];
    const result = buildFocusSessionAssembly(sessions, new Map([["s1", [node("答案")]]]));
    expect(result.sessionsByMessageId.size).toBe(0);
    expect(result.allSessions).toEqual([
      { sessionId: "s1", rootLabel: "s1", answeredCount: 1, createdAt: "2026-08-14T10:00:00.000Z" },
    ]);
  });

  it("sorts allSessions newest first", () => {
    const sessions = [
      session({ id: "older", created_at: "2026-08-14T09:00:00.000Z" }),
      session({ id: "newer", created_at: "2026-08-14T11:00:00.000Z" }),
    ];
    const nodesBySession = new Map([
      ["older", [node("a")]],
      ["newer", [node("b")]],
    ]);
    const result = buildFocusSessionAssembly(sessions, nodesBySession);
    expect(result.allSessions.map((s) => s.sessionId)).toEqual(["newer", "older"]);
  });
});
