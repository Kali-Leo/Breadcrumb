/**
 * Purpose: zustand store assembling a conversation's focus sessions for two in-place surfaces
 * (Leo 2026-08-14 revision to spec 042 §5: a focus session's exit no longer posts a chat
 * message) — the per-message badge map and the top-of-chat bar's session list, plus the legacy
 * entry_message_id map so pre-revision exit-record messages still render as FocusEntryCard.
 * Also owns the focus:exited subscription, same "store listens for the event it cares about"
 * precedent as doorStore's knowledge:nodesExtracted subscription: a session that ends with no
 * answered station is deleted outright (data and all); one that does just gets these maps
 * refreshed.
 * Main exports: useFocusSessionsStore, FocusSessionBadgeEntry, FocusSessionSummary.
 */
import { create } from "zustand";
import { getRepos } from "../lib/db";
import {
  buildFocusSessionAssembly,
  type FocusSessionBadgeEntry,
  type FocusSessionSummary,
} from "../lib/focusSessionsAssembly";
import { appEventBus, useChatStore } from "./chatStore";

export type { FocusSessionBadgeEntry, FocusSessionSummary };

interface FocusSessionsState {
  entrySessionByMessageId: Map<string, string>;
  sessionsByMessageId: Map<string, FocusSessionBadgeEntry[]>;
  allSessions: FocusSessionSummary[];
  loadForConversation(conversationId: string | null): Promise<void>;
}

export const useFocusSessionsStore = create<FocusSessionsState>((set) => ({
  entrySessionByMessageId: new Map(),
  sessionsByMessageId: new Map(),
  allSessions: [],

  async loadForConversation(conversationId) {
    if (conversationId === null) {
      set({ entrySessionByMessageId: new Map(), sessionsByMessageId: new Map(), allSessions: [] });
      return;
    }
    const repos = await getRepos();
    const sessions = await repos.focusSessions.listByConversation(conversationId);
    const nodesBySession = new Map(
      await Promise.all(
        sessions.map(
          async (session) =>
            [session.id, await repos.focusNodes.listBySession(session.id)] as const,
        ),
      ),
    );
    set(buildFocusSessionAssembly(sessions, nodesBySession));
  },
}));

// Focus sessions are session-scoped data, not messages (Leo 2026-08-14 revision to spec 042
// §5): a session that never grew an answered station leaves nothing behind on exit — no
// message, no badge, no bar row — so it is deleted outright. One that does have an answer just
// needs these maps refreshed; only bothers when its conversation is still the open one.
appEventBus.on("focus:exited", ({ sessionId }) => {
  void (async () => {
    const repos = await getRepos();
    const session = await repos.focusSessions.getById(sessionId);
    if (session === null) return;
    const nodes = await repos.focusNodes.listBySession(sessionId);
    const hasAnswer = nodes.some((node) => node.answer_text.length > 0);
    if (!hasAnswer) {
      await repos.focusNodes.removeBySession(sessionId);
      await repos.focusSessions.remove(sessionId);
      return;
    }
    if (useChatStore.getState().activeConversationId !== session.conversation_id) return;
    await useFocusSessionsStore.getState().loadForConversation(session.conversation_id);
  })();
});
