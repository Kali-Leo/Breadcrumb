/**
 * Purpose: unit tests for findRetryUserLeaf — the pure guard deciding whether a failed round
 * can retry (error present, idle, and the current leaf is the round's user message).
 */
import type { MessageRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { findRetryUserLeaf } from "./chatAssistantRound";

function message(id: string, role: MessageRow["role"]): MessageRow {
  return {
    id,
    conversation_id: "conversation-1",
    role,
    content: `content of ${id}`,
    created_at: "2026-08-16T00:00:00.000Z",
    teaching_mode: null,
    parent_id: null,
  };
}

describe("findRetryUserLeaf", () => {
  // Shape-derived on purpose: no errorText input — a reload wipes runtime error state,
  // but an unanswered user leaf must stay retryable regardless.
  const failedSession = {
    streamingText: null,
    messages: [message("m1", "user"), message("m2", "assistant"), message("m3", "user")],
  };

  it("returns the unanswered user leaf of an idle session", () => {
    expect(findRetryUserLeaf(failedSession)?.id).toBe("m3");
  });

  it("returns null while a stream is in flight", () => {
    expect(findRetryUserLeaf({ ...failedSession, streamingText: "部分回复" })).toBeNull();
  });

  it("returns null when the leaf is an assistant message (round already answered)", () => {
    expect(
      findRetryUserLeaf({
        ...failedSession,
        messages: [message("m1", "user"), message("m2", "assistant")],
      }),
    ).toBeNull();
  });

  it("returns null for an empty session", () => {
    expect(findRetryUserLeaf({ ...failedSession, messages: [] })).toBeNull();
  });
});
