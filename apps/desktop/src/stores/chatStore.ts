/**
 * Purpose: zustand store driving the chat flow — conversations, per-conversation sessions
 * (each owns its message tree/streaming buffer/cost, so parallel windows never cross-wire),
 * per-conversation composer drafts, the active-session mirror, and send/stop/retry entries.
 * Main exports: useChatStore, appEventBus, CostByCurrency.
 */
import { createEventBus } from "@breadcrumb/core-bus";
import type { ConversationKind, ConversationRow, MessageRow } from "@breadcrumb/core-db";
import { create } from "zustand";
import { runChatRetryRound } from "../lib/chatAssistantRound";
import { type ChatSendDeps, runChatSendPipeline } from "../lib/chatSendPipeline";
import {
  type ActiveMirror,
  type ChatSession,
  type CostByCurrency,
  EMPTY_ACTIVE_MIRROR,
  loadChatSession,
} from "../lib/chatSessions";
import { createSessionWriters } from "../lib/chatSessionWriters";
import { abortStreamControl } from "../lib/chatStreamControl";
import {
  foldAppendedMessage,
  resumeTreeState,
  returnToLatestTreeState,
} from "../lib/chatTreeActions";
import { getRepos } from "../lib/db";
import { todayLocalMidnightIso } from "../lib/time";

export const appEventBus = createEventBus();
export type { CostByCurrency };

interface ChatState extends ActiveMirror {
  conversations: ConversationRow[];
  todayCost: CostByCurrency;
  /** One runtime session per open conversation — the source of truth; the ActiveMirror
   * fields are a faithful copy of the ACTIVE session for the main view's components. */
  sessions: ReadonlyMap<string, ChatSession>;
  activeConversationId: string | null;
  /** Per-conversation composer drafts (null key = the new-conversation composer); a draft
   * is cleared only once its user message actually persisted. */
  drafts: ReadonlyMap<string | null, string>;
  loadFromDatabase(): Promise<void>;
  /** Loads a session without touching the active binding — parallel windows use this. */
  ensureSession(id: string): Promise<ChatSession>;
  openConversation(id: string): Promise<void>;
  startNewConversation(): void;
  /** Non-destructive continuation from any station (spec 040 §2). */
  resumeFromMessage(messageId: string): void;
  returnToLatest(): void;
  /** Sends into the given conversation (defaults to the active one; null active = a fresh
   * conversation is created). The round stays bound to that conversation for its lifetime. */
  sendMessage(content: string, targetConversationId?: string): Promise<void>;
  /** Stops the conversation's in-flight reply (null = active), keeping the partial text. */
  stopStreaming(conversationId: string | null): void;
  /** Re-runs a failed round's assistant half against the current user leaf (no new append). */
  retryRound(conversationId: string): Promise<void>;
  setDraft(conversationId: string | null, text: string): void;
  /** The active path of one conversation — event handlers must use this instead of the
   * active mirror, or they read whatever happens to be on screen. */
  messagesFor(conversationId: string): MessageRow[];
  kindFor(conversationId: string): ConversationKind;
  /** Folds an externally-appended row (invitation, thanks, exit record) into its session. */
  noteExternalMessage(conversationId: string, message: MessageRow): void;
}

/** In-flight session loads, deduped per conversation (StrictMode double-mounts, popup +
 * send racing) — a stale load's putSession must not clobber folded messages. */
const sessionLoads = new Map<string, Promise<ChatSession>>();
/** The most recently requested open — a slower open resolving late must not yank the
 * active binding back. */
let latestOpenRequestId: string | null = null;

export const useChatStore = create<ChatState>((set, get) => {
  const { patchSession, putSession, setRoundError } = createSessionWriters(set, get);

  function roundDeps(): ChatSendDeps {
    return {
      activeConversationId: () => get().activeConversationId,
      ensureSession: (id) => get().ensureSession(id),
      patchSession,
      putSession,
      setRoundError,
      clearDraft: (key) => get().setDraft(key, ""),
      setGlobalMeters: (patch) => set(patch),
      emitMessageSent: (payload) => appEventBus.emit("chat:messageSent", payload),
      emitResponseFinished: (payload) => appEventBus.emit("chat:responseFinished", payload),
    };
  }

  return {
    conversations: [],
    todayCost: new Map(),
    sessions: new Map(),
    activeConversationId: null,
    drafts: new Map(),
    ...EMPTY_ACTIVE_MIRROR,

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

    async openConversation(id) {
      latestOpenRequestId = id;
      // Always reload: an external append the session missed must not stay invisible.
      const session = await loadChatSession(await getRepos(), id);
      // Only the newest open request may move the active binding (fast A→B clicking).
      putSession(id, session, latestOpenRequestId === id);
      // Opening a helper's conversation reads its invitation — the roster dot clears.
      if (session.companionId !== null) {
        const { useCompanionStore } = await import("./companionStore");
        useCompanionStore.getState().markHelperSeen(session.companionId);
      }
    },

    startNewConversation() {
      set({ activeConversationId: null, ...EMPTY_ACTIVE_MIRROR });
    },

    resumeFromMessage(messageId) {
      const id = get().activeConversationId;
      if (id === null) return;
      patchSession(id, (session) => ({ ...session, ...resumeTreeState(session, messageId) }));
    },

    returnToLatest() {
      const id = get().activeConversationId;
      if (id === null) return;
      patchSession(id, (session) => ({ ...session, ...returnToLatestTreeState(session) }));
    },

    setDraft(conversationId, text) {
      set((state) => {
        if ((state.drafts.get(conversationId) ?? "") === text) return {};
        const drafts = new Map(state.drafts);
        if (text === "") drafts.delete(conversationId);
        else drafts.set(conversationId, text);
        return { drafts };
      });
    },

    stopStreaming(conversationId) {
      const id = conversationId ?? get().activeConversationId;
      if (id !== null) abortStreamControl(id);
    },

    async retryRound(conversationId) {
      const session = get().sessions.get(conversationId);
      if (session === undefined) return;
      await runChatRetryRound(roundDeps(), conversationId, session);
    },

    messagesFor(conversationId) {
      return get().sessions.get(conversationId)?.messages ?? [];
    },

    kindFor(conversationId) {
      return get().sessions.get(conversationId)?.kind ?? "chat";
    },

    noteExternalMessage(conversationId, message) {
      patchSession(conversationId, (session) =>
        session.allMessages.some((m) => m.id === message.id)
          ? session
          : { ...session, ...foldAppendedMessage(session, message) },
      );
    },

    async sendMessage(content, targetConversationId) {
      await runChatSendPipeline(roundDeps(), content, targetConversationId);
    },
  };
});
