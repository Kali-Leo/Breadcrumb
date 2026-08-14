/**
 * Purpose: zustand store mapping a focus session's exit-record message id back to its session
 * id (spec 042 §5) — lets ChatView render FocusEntryCard for that message instead of a plain
 * bubble, and reopen the session on click. Also owns the focus:exited -> writeFocusEntry wiring,
 * the same "store listens for the event it cares about" precedent as doorStore's
 * knowledge:nodesExtracted subscription.
 * Main exports: useFocusEntryStore.
 */
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { writeFocusEntry } from "../lib/focusEntryActions";
import { appEventBus, useChatStore } from "./chatStore";

interface FocusEntryState {
  entrySessionByMessageId: Map<string, string>;
  loadForConversation(conversationId: string | null): Promise<void>;
}

export const useFocusEntryStore = create<FocusEntryState>((set) => ({
  entrySessionByMessageId: new Map(),

  async loadForConversation(conversationId) {
    if (conversationId === null) {
      set({ entrySessionByMessageId: new Map() });
      return;
    }
    const repos = await getRepos();
    const sessions = await repos.focusSessions.listByConversation(conversationId);
    const map = new Map<string, string>();
    for (const session of sessions) {
      if (session.entry_message_id !== null) map.set(session.entry_message_id, session.id);
    }
    set({ entrySessionByMessageId: map });
  },
}));

// A focus session's exit lands its record message directly in the host conversation (spec
// 042 §5). Only refreshes chatStore/this map when that conversation is still the open one —
// otherwise there is nothing on screen to update.
appEventBus.on("focus:exited", ({ sessionId }) => {
  void (async () => {
    const messageId = await writeFocusEntry(sessionId);
    if (messageId === null) return;
    const repos = await getRepos();
    const session = await repos.focusSessions.getById(sessionId);
    if (session === null) return;
    if (useChatStore.getState().activeConversationId !== session.conversation_id) return;
    await useChatStore.getState().openConversation(session.conversation_id);
    await useFocusEntryStore.getState().loadForConversation(session.conversation_id);
  })();
});
