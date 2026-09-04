/**
 * Purpose: zustand store driving the chat flow — conversations, per-conversation sessions
 * (each owns its message tree/streaming buffer/cost, so parallel windows never cross-wire),
 * per-conversation composer drafts, the active-session mirror, and send/stop/retry entries.
 * Main exports: useChatStore, appEventBus, CostByCurrency.
 */
import { createEventBus } from "@breadcrumb/core-bus";
import type { ConversationKind, ConversationRow, MessageRow } from "@breadcrumb/core-db";
import { create } from "zustand";
import { runChatRetryRound } from "../lib/chat/chatAssistantRound";
import {
  type ConversationActions,
  createConversationActions,
} from "../lib/chat/chatConversationActions";
import { type ChatSendDeps, runChatSendPipeline } from "../lib/chat/chatSendPipeline";
import {
  type ActiveMirror,
  type ChatSession,
  type CostByCurrency,
  EMPTY_ACTIVE_MIRROR,
} from "../lib/chat/chatSessions";
import { createSessionWriters } from "../lib/chat/chatSessionWriters";
import { abortStreamControl } from "../lib/chat/chatStreamControl";
import {
  foldAppendedMessage,
  resumeTreeState,
  returnToLatestTreeState,
} from "../lib/chat/chatTreeActions";
import { getRepos } from "../lib/platform/db";

export const appEventBus = createEventBus();
export type { CostByCurrency };

interface ChatState extends ActiveMirror, ConversationActions {
  conversations: ConversationRow[];
  todayCost: CostByCurrency;
  /** One runtime session per open conversation — the source of truth; the ActiveMirror
   * fields are a faithful copy of the ACTIVE session for the main view's components. */
  sessions: ReadonlyMap<string, ChatSession>;
  activeConversationId: string | null;
  /** Per-conversation composer drafts (null key = the new-conversation composer); a draft
   * is cleared only once its user message actually persisted. */
  drafts: ReadonlyMap<string | null, string>;
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
  /** The 学习模式 state the composer shows (spec 052); the null key is the new-conversation
   * composer, whose state is sticky and stamps each conversation it births. */
  newConversationStudyMode: boolean;
  studyModeFor(conversationId: string | null): boolean;
  setStudyMode(conversationId: string | null, on: boolean): Promise<void>;
  /** Folds an externally-appended row (invitation, thanks, exit record) into its session. */
  noteExternalMessage(conversationId: string, message: MessageRow): void;
}

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
      readNewConversationStudyMode: () => get().newConversationStudyMode,
      setGlobalMeters: (patch) => set(patch),
      emitMessageSent: (payload) => appEventBus.emit("chat:messageSent", payload),
      isConversationLive: (id) => get().sessions.has(id),
      emitResponseFinished: (payload) => appEventBus.emit("chat:responseFinished", payload),
    };
  }

  return {
    conversations: [],
    todayCost: new Map(),
    sessions: new Map(),
    activeConversationId: null,
    drafts: new Map(),
    newConversationStudyMode: false,
    ...EMPTY_ACTIVE_MIRROR,
    ...createConversationActions(set, get, putSession),

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

    studyModeFor(conversationId) {
      if (conversationId === null) return get().newConversationStudyMode;
      return get().sessions.get(conversationId)?.studyMode ?? false;
    },

    async setStudyMode(conversationId, on) {
      if (conversationId === null) {
        set({ newConversationStudyMode: on });
        return;
      }
      // Session first (the round reads runtime state), then the row (persistence).
      patchSession(conversationId, (session) => ({ ...session, studyMode: on }));
      const repos = await getRepos();
      await repos.conversations.setStudyMode(conversationId, on ? 1 : 0);
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
