/**
 * Purpose: pure message-tree wiring extracted from chatStore (spec 040 §2) — deriving the
 * active path from allMessages+currentLeafId, resolving a new message's parent, and folding
 * a freshly-appended row into the next tree state. Keeps chatStore.ts under the file-size cap
 * and gives the tree wiring dedicated unit tests.
 * Main exports: TreeSlice, TreeState, deriveActiveMessages, resolveSendParentId,
 * foldAppendedMessage, resumeTreeState, returnToLatestTreeState.
 */
import type { MessageRow } from "@breadcrumb/core-db";
import { newestLeafId, pathToLeaf } from "./messageTree";

/** The subset of chat store state the tree derivations read. */
export interface TreeSlice {
  allMessages: MessageRow[];
  currentLeafId: string | null;
}

export interface TreeState extends TreeSlice {
  messages: MessageRow[];
}

/** The active path — root to `currentLeafId`, or to the newest leaf when unset ("reopen lands
 * where you left off", spec 040 §1). This is what renders and what LLM history is built from. */
export function deriveActiveMessages(slice: TreeSlice): MessageRow[] {
  const leafId = slice.currentLeafId ?? newestLeafId(slice.allMessages);
  return leafId === null ? [] : pathToLeaf(slice.allMessages, leafId);
}

/** Parent id for a new user message: the current leaf, falling back to the newest leaf when no
 * mid-tree continuation is active (spec 040 §2). */
export function resolveSendParentId(slice: TreeSlice): string | null {
  return slice.currentLeafId ?? newestLeafId(slice.allMessages);
}

/** Folds one freshly-appended row (user or assistant) into the next tree state: it becomes the
 * new current leaf, and `messages` re-derives to include it. Used twice per send round — once
 * for the user message, once for the assistant reply. */
export function foldAppendedMessage(slice: TreeSlice, appended: MessageRow): TreeState {
  const allMessages = [...slice.allMessages, appended];
  const currentLeafId = appended.id;
  return {
    allMessages,
    currentLeafId,
    messages: deriveActiveMessages({ allMessages, currentLeafId }),
  };
}

/** Non-destructive continuation from any station (spec 040 §2): the current leaf moves to
 * `messageId` and the path re-derives. Everything past the old leaf is untouched — the next
 * send forks from here instead of overwriting it. */
export function resumeTreeState(slice: TreeSlice, messageId: string): TreeState {
  return {
    allMessages: slice.allMessages,
    currentLeafId: messageId,
    messages: deriveActiveMessages({ allMessages: slice.allMessages, currentLeafId: messageId }),
  };
}

/** "Back to latest": jumps the current leaf back to the newest leaf across all branches. */
export function returnToLatestTreeState(slice: TreeSlice): TreeState {
  const currentLeafId = newestLeafId(slice.allMessages);
  return {
    allMessages: slice.allMessages,
    currentLeafId,
    messages: deriveActiveMessages({ allMessages: slice.allMessages, currentLeafId }),
  };
}
