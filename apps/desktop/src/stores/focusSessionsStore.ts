/**
 * Purpose: zustand store assembling each conversation's focus sessions for two in-place
 * surfaces (Leo 2026-08-14 revision to spec 042 §5: a focus session's exit no longer posts a
 * chat message) — the per-message badge map and the top-of-chat bar's session list, plus the
 * legacy entry_message_id map so pre-revision exit-record messages still render as
 * FocusEntryCard. Assemblies are layered per conversation (filled on first visit, never wiped
 * on switch — layers accumulate for conversations visited this session, the Discord tradeoff)
 * with an active mirror for the badge/bar readers, chatStore's sessions pattern. Also owns the
 * focus:exited subscription, same "store listens for the event it cares about" precedent as
 * doorStore's knowledge:nodesExtracted subscription: a session that ends with no answered
 * station is deleted outright (data and all); one that does refreshes ITS conversation's layer.
 * Main exports: useFocusSessionsStore, FocusSessionBadgeEntry, FocusSessionSummary.
 */
import { create } from "zustand";
import { createSingleFlightLoader, setConversationLayer } from "../lib/chat/conversationLayers";
import {
  buildFocusSessionAssembly,
  type FocusSessionAssembly,
  type FocusSessionBadgeEntry,
  type FocusSessionSummary,
} from "../lib/focus/focusSessionsAssembly";
import { getRepos } from "../lib/platform/db";
import { appEventBus, useChatStore } from "./chatStore";

export type { FocusSessionBadgeEntry, FocusSessionSummary };

interface FocusSessionsState {
  /** Source of truth: one assembled view per conversation visited this session. */
  assemblyByConversation: ReadonlyMap<string, FocusSessionAssembly>;
  /** Active mirror of the open conversation's layer — ChatView/FocusSessionBadge/
   * FocusSessionsBar read these three directly, chatStore's ActiveMirror pattern. */
  entrySessionByMessageId: Map<string, string>;
  sessionsByMessageId: Map<string, FocusSessionBadgeEntry[]>;
  allSessions: FocusSessionSummary[];
  /** Fill-on-first-visit: loads the layer once and mirrors it; revisits mirror the cached
   * layer instantly with no refetch. Null just empties the mirror (new-conversation view). */
  ensureLoaded(conversationId: string | null): Promise<void>;
  /** Forced DB reload into the conversation's layer (focus:exited path); the mirror follows
   * only when that conversation is the open one — checked at write time. */
  refreshConversation(conversationId: string): Promise<void>;
}

const EMPTY_MIRROR = {
  entrySessionByMessageId: new Map<string, string>(),
  sessionsByMessageId: new Map<string, FocusSessionBadgeEntry[]>(),
  allSessions: [] as FocusSessionSummary[],
};

const singleFlightLoad = createSingleFlightLoader();

async function loadAssemblyFromDatabase(conversationId: string): Promise<FocusSessionAssembly> {
  const repos = await getRepos();
  const sessions = await repos.focusSessions.listByConversation(conversationId);
  const nodesBySession = new Map(
    await Promise.all(
      sessions.map(
        async (session) => [session.id, await repos.focusNodes.listBySession(session.id)] as const,
      ),
    ),
  );
  return buildFocusSessionAssembly(sessions, nodesBySession);
}

export const useFocusSessionsStore = create<FocusSessionsState>((set, get) => ({
  assemblyByConversation: new Map(),
  ...EMPTY_MIRROR,

  async ensureLoaded(conversationId) {
    if (conversationId === null) {
      set({ ...EMPTY_MIRROR });
      return;
    }
    const cached = get().assemblyByConversation.get(conversationId);
    if (cached !== undefined) {
      set({ ...cached });
      return;
    }
    set({ ...EMPTY_MIRROR }); // the previous conversation's badges must not show while loading
    await singleFlightLoad(conversationId, async () => {
      if (get().assemblyByConversation.has(conversationId)) return;
      await get().refreshConversation(conversationId);
    });
  },

  async refreshConversation(conversationId) {
    const assembly = await loadAssemblyFromDatabase(conversationId);
    // Re-checked at write time: the load spans awaits during which the user may have
    // switched — the layer always lands, the mirror only follows the open conversation.
    const isOpenConversation = useChatStore.getState().activeConversationId === conversationId;
    set((state) => ({
      assemblyByConversation: setConversationLayer(
        state.assemblyByConversation,
        conversationId,
        assembly,
      ),
      ...(isOpenConversation ? assembly : {}),
    }));
  },
}));

// Focus sessions are session-scoped data, not messages (Leo 2026-08-14 revision to spec 042
// §5): a session that never grew an answered station leaves nothing behind on exit — no
// message, no badge, no bar row — so it is deleted outright. One that does have an answer
// refreshes the layer of the conversation the SESSION row belongs to (never the active one),
// so an exit that lands after switching away still shows its badge when you switch back.
appEventBus.on("focus:exited", ({ sessionId }) => {
  void (async () => {
    const repos = await getRepos();
    const session = await repos.focusSessions.getById(sessionId);
    if (session === null) return;
    const nodes = await repos.focusNodes.listBySession(sessionId);
    const hasAnswer = nodes.some((node) => node.answer_text.length > 0);
    if (!hasAnswer) {
      // One transaction for nodes + session — a crash mid-delete can't strand orphans.
      await repos.focusSessions.removeWithNodes(sessionId);
      return;
    }
    await useFocusSessionsStore.getState().refreshConversation(session.conversation_id);
  })();
});
