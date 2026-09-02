/**
 * Purpose: chatStore's conversation-lifecycle half — the sidebar list load, the deduped
 * per-conversation session load, and open/rename/delete — extracted as a factory so the store
 * stays an orchestrator under the file-size cap. Every session write still goes through the
 * store's single write path (putSession), so the active mirror stays in sync by construction.
 * Main exports: createConversationActions, ConversationActions, ConversationSliceState.
 */
import type { ConversationRow } from "@breadcrumb/core-db";
import { getRepos } from "../platform/db";
import { todayLocalMidnightIso } from "../platform/time";
import { type ChatSession, type CostByCurrency, loadChatSession } from "./chatSessions";
import type { SessionWriters } from "./chatSessionWriters";

/** The slice of chatStore state these actions read and produce. */
export interface ConversationSliceState {
  conversations: ConversationRow[];
  todayCost: CostByCurrency;
  sessions: ReadonlyMap<string, ChatSession>;
  activeConversationId: string | null;
  startNewConversation(): void;
}

export interface ConversationActions {
  loadFromDatabase(): Promise<void>;
  /** Loads a session without touching the active binding — parallel windows use this. */
  ensureSession(id: string): Promise<ChatSession>;
  openConversation(id: string): Promise<void>;
  /** Gives a conversation the name the learner typed, which also freezes auto-naming. */
  renameConversation(id: string, title: string): Promise<void>;
  /** Removes a conversation and the footprints it left (see conversationsRepo.remove). */
  deleteConversation(id: string): Promise<void>;
}

/** In-flight session loads, deduped per conversation (StrictMode double-mounts, popup +
 * send racing) — a stale load's putSession must not clobber folded messages. */
const sessionLoads = new Map<string, Promise<ChatSession>>();
/** The most recently requested open — a slower open resolving late must not yank the
 * active binding back. */
let latestOpenRequestId: string | null = null;

export function createConversationActions(
  set: (patch: Partial<ConversationSliceState>) => void,
  get: () => ConversationSliceState,
  putSession: SessionWriters["putSession"],
): ConversationActions {
  return {
    async loadFromDatabase() {
      const repos = await getRepos();
      // Sidebar lists only 'chat' kind — practice discussions (spec 026) stay hidden here.
      const [conversations, todayCost] = await Promise.all([
        repos.conversations.listByKind("chat"),
        repos.llmCalls.sumCostSince(todayLocalMidnightIso()),
      ]);
      set({ conversations, todayCost });
    },

    async ensureSession(id) {
      const existing = get().sessions.get(id);
      if (existing !== undefined) return existing;
      const inFlight = sessionLoads.get(id);
      if (inFlight !== undefined) return inFlight;
      const load = (async () => {
        const session = await loadChatSession(await getRepos(), id);
        // A session that appeared meanwhile (a send round folded into it) wins over the
        // older DB snapshot.
        const current = get().sessions.get(id);
        if (current !== undefined) return current;
        putSession(id, session, false);
        return session;
      })();
      sessionLoads.set(id, load);
      try {
        return await load;
      } finally {
        sessionLoads.delete(id);
      }
    },

    async renameConversation(id, title) {
      const trimmed = title.trim();
      if (trimmed === "") return;
      const repos = await getRepos();
      await repos.conversations.rename(id, trimmed);
      set({
        conversations: get().conversations.map((conversation) =>
          conversation.id === id
            ? { ...conversation, title: trimmed, auto_title: null }
            : conversation,
        ),
      });
    },

    async deleteConversation(id) {
      const repos = await getRepos();
      await repos.conversations.remove(id);
      const sessions = new Map(get().sessions);
      sessions.delete(id);
      const wasActive = get().activeConversationId === id;
      set({
        conversations: get().conversations.filter((conversation) => conversation.id !== id),
        sessions,
      });
      // A deleted conversation must not stay on screen; the composer returns to the blank
      // state a new chat starts from.
      if (wasActive) get().startNewConversation();
      // Footprints went with it, so anything drawn from them is now stale.
      const { useKnowledgeStore } = await import("../../stores/knowledgeStore");
      await useKnowledgeStore.getState().loadTree();
      const { useMemoryStore } = await import("../../stores/memoryStore");
      await useMemoryStore.getState().refresh();
    },

    async openConversation(id) {
      latestOpenRequestId = id;
      // Always reload: an external append the session missed must not stay invisible.
      const session = await loadChatSession(await getRepos(), id);
      // Only the newest open request may move the active binding (fast A→B clicking).
      putSession(id, session, latestOpenRequestId === id);
      // Opening a helper's conversation reads its invitation — the roster dot clears.
      if (session.companionId !== null) {
        const { useCompanionStore } = await import("../../stores/companionStore");
        useCompanionStore.getState().markHelperSeen(session.companionId);
      }
    },
  };
}
