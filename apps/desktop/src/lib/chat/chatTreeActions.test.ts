/**
 * Purpose: unit tests for chatTreeActions' pure derivations — active-path rendering, the new
 * message's parent resolution, append folding, resume, and return-to-latest.
 */
import type { MessageRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import {
  deriveActiveMessages,
  foldAppendedMessage,
  resolveSendParentId,
  resumeTreeState,
  returnToLatestTreeState,
  type TreeSlice,
} from "./chatTreeActions";

function row(id: string, createdAt: string, parentId: string | null): MessageRow {
  return {
    id,
    conversation_id: "c1",
    role: id.startsWith("u") ? "user" : "assistant",
    content: id,
    created_at: createdAt,
    teaching_mode: null,
    parent_id: parentId,
  };
}

describe("deriveActiveMessages", () => {
  it("falls back to the newest leaf's path when currentLeafId is null", () => {
    const slice: TreeSlice = {
      allMessages: [
        row("u1", "2026-08-14T10:00:00Z", null),
        row("a1", "2026-08-14T10:01:00Z", "u1"),
      ],
      currentLeafId: null,
    };
    expect(deriveActiveMessages(slice).map((m) => m.id)).toEqual(["u1", "a1"]);
  });

  it("follows currentLeafId onto a non-newest branch", () => {
    const slice: TreeSlice = {
      allMessages: [
        row("u1", "2026-08-14T10:00:00Z", null),
        row("a1", "2026-08-14T10:01:00Z", "u1"), // fork point
        row("u2", "2026-08-14T10:02:00Z", "a1"),
        row("u3", "2026-08-14T10:03:00Z", "a1"), // other, newer branch
      ],
      currentLeafId: "u2",
    };
    expect(deriveActiveMessages(slice).map((m) => m.id)).toEqual(["u1", "a1", "u2"]);
  });

  it("empty allMessages yields an empty path", () => {
    expect(deriveActiveMessages({ allMessages: [], currentLeafId: null })).toEqual([]);
  });
});

describe("resolveSendParentId", () => {
  it("uses the current leaf when a mid-tree continuation is active", () => {
    const slice: TreeSlice = {
      allMessages: [row("u1", "2026-08-14T10:00:00Z", null)],
      currentLeafId: "u1",
    };
    expect(resolveSendParentId(slice)).toBe("u1");
  });

  it("falls back to the newest leaf when currentLeafId is null", () => {
    const slice: TreeSlice = {
      allMessages: [
        row("u1", "2026-08-14T10:00:00Z", null),
        row("a1", "2026-08-14T10:01:00Z", "u1"),
      ],
      currentLeafId: null,
    };
    expect(resolveSendParentId(slice)).toBe("a1");
  });

  it("returns null for an empty conversation", () => {
    expect(resolveSendParentId({ allMessages: [], currentLeafId: null })).toBeNull();
  });
});

describe("foldAppendedMessage", () => {
  it("appends the row, makes it the current leaf, and re-derives messages", () => {
    const slice: TreeSlice = {
      allMessages: [row("u1", "2026-08-14T10:00:00Z", null)],
      currentLeafId: "u1",
    };
    const appended = row("a1", "2026-08-14T10:01:00Z", "u1");
    const next = foldAppendedMessage(slice, appended);
    expect(next.allMessages.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(next.currentLeafId).toBe("a1");
    expect(next.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
  });

  it("forks off a mid-tree leaf: new message becomes the leaf, older branch stays in allMessages", () => {
    const slice: TreeSlice = {
      allMessages: [
        row("u1", "2026-08-14T10:00:00Z", null),
        row("a1", "2026-08-14T10:01:00Z", "u1"),
        row("u2-old", "2026-08-14T10:02:00Z", "a1"),
      ],
      currentLeafId: "a1", // resumed from the fork point
    };
    const appended = row("u2-new", "2026-08-14T10:03:00Z", "a1");
    const next = foldAppendedMessage(slice, appended);
    expect(next.currentLeafId).toBe("u2-new");
    expect(next.messages.map((m) => m.id)).toEqual(["u1", "a1", "u2-new"]);
    // the old branch is neither dropped nor overwritten
    expect(next.allMessages.some((m) => m.id === "u2-old")).toBe(true);
  });
});

describe("resumeTreeState", () => {
  it("moves the current leaf to the given message and re-derives its path", () => {
    const slice: TreeSlice = {
      allMessages: [
        row("u1", "2026-08-14T10:00:00Z", null),
        row("a1", "2026-08-14T10:01:00Z", "u1"),
        row("u2", "2026-08-14T10:02:00Z", "a1"),
      ],
      currentLeafId: "u2",
    };
    const next = resumeTreeState(slice, "u1");
    expect(next.currentLeafId).toBe("u1");
    expect(next.messages.map((m) => m.id)).toEqual(["u1"]);
    // non-destructive: allMessages untouched
    expect(next.allMessages).toHaveLength(3);
  });
});

describe("returnToLatestTreeState", () => {
  it("jumps back to the newest leaf across branches", () => {
    const slice: TreeSlice = {
      allMessages: [
        row("u1", "2026-08-14T10:00:00Z", null),
        row("a1", "2026-08-14T10:01:00Z", "u1"),
        row("u2", "2026-08-14T10:02:00Z", "a1"),
      ],
      currentLeafId: "u1", // mid-tree continuation
    };
    const next = returnToLatestTreeState(slice);
    expect(next.currentLeafId).toBe("u2");
    expect(next.messages.map((m) => m.id)).toEqual(["u1", "a1", "u2"]);
  });
});
