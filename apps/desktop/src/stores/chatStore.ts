/**
 * Purpose: zustand store driving the chat flow — conversations, messages, streaming state,
 * cost meters, and the full send pipeline (persist -> LLM stream -> persist -> meter -> bus).
 * Main exports: useChatStore, appEventBus.
 */
import { createEventBus } from "@breadcrumb/core-bus";
import type { ConversationKind, ConversationRow, Currency, MessageRow } from "@breadcrumb/core-db";
import type { ChatMessage } from "@breadcrumb/core-llm";
import { create } from "zustand";
import { ensureChatConversationId } from "../lib/chatRoundContext";
import { appendUserMessage, runSendRound } from "../lib/chatSendRound";
import {
  deriveActiveMessages,
  foldAppendedMessage,
  resumeTreeState,
  returnToLatestTreeState,
} from "../lib/chatTreeActions";
import { COMPANION_DESKTOP_COPY } from "../lib/companionActions";
import { getRepos } from "../lib/db";
import { newestLeafId } from "../lib/messageTree";
import { todayLocalMidnightIso } from "../lib/time";
import { useSettingsStore } from "./settingsStore";

export const appEventBus = createEventBus();

export type CostByCurrency = ReadonlyMap<Currency, number>;

interface ChatState {
  conversations: ConversationRow[];
  activeConversationId: string | null;
  /** Kind of the open conversation — 'teach' switches the system prompt (spec 034). */
  activeKind: ConversationKind;
  /** companion_id of the open conversation, or null — 'companion' chats and companion-played
   * 'teach' sessions alike (spec 037). */
  activeCompanionId: string | null;
  /** Every row for the open conversation, tree edges and all (spec 040 §1). */
  allMessages: MessageRow[];
  /** Current station; root-to-here defines `messages`. Null = "the newest leaf" (spec 040 §1). */
  currentLeafId: string | null;
  /** The active path, derived from allMessages+currentLeafId — renders and feeds LLM history. */
  messages: MessageRow[];
  streamingText: string | null;
  errorText: string | null;
  conversationCost: CostByCurrency;
  todayCost: CostByCurrency;
  loadFromDatabase(): Promise<void>;
  openConversation(id: string): Promise<void>;
  startNewConversation(): void;
  /** Non-destructive continuation from any station: moves the current leaf, keeping every
   * other branch intact and visible on the station map (spec 040 §2). */
  resumeFromMessage(messageId: string): void;
  /** Jumps the current leaf back to the newest one across all branches. */
  returnToLatest(): void;
  sendMessage(content: string): Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  activeKind: "chat",
  activeCompanionId: null,
  allMessages: [],
  currentLeafId: null,
  messages: [],
  streamingText: null,
  errorText: null,
  conversationCost: new Map(),
  todayCost: new Map(),

  async loadFromDatabase() {
    const repos = await getRepos();
    // Sidebar list only ever shows 'chat' conversations — practice discussions (spec 026)
    // are saved but deliberately hidden here.
    const [conversations, todayCost] = await Promise.all([
      repos.conversations.listByKind("chat"),
      repos.llmCalls.sumCostSince(todayLocalMidnightIso()),
    ]);
    set({ conversations, todayCost });
  },

  async openConversation(id) {
    const repos = await getRepos();
    const [allMessages, conversationCost, conversation] = await Promise.all([
      repos.messages.listByConversation(id),
      repos.llmCalls.sumCostForConversation(id),
      repos.conversations.getById(id),
    ]);
    // "Reopen lands where you left off" (spec 040 §1): the newest leaf's path.
    const currentLeafId = newestLeafId(allMessages);
    set({
      activeConversationId: id,
      activeKind: conversation?.kind ?? "chat",
      activeCompanionId: conversation?.companion_id ?? null,
      allMessages,
      currentLeafId,
      messages: deriveActiveMessages({ allMessages, currentLeafId }),
      conversationCost,
      streamingText: null,
      errorText: null,
    });
    // Opening the companion's chat reads her pending invitation — the sidebar dot clears.
    if (conversation?.kind === "companion" && conversation.companion_id !== null) {
      const { useCompanionStore } = await import("./companionStore");
      const companionState = useCompanionStore.getState();
      if (companionState.activeProposal?.companion_id === conversation.companion_id) {
        companionState.markProposalSeen();
      }
    }
  },

  startNewConversation() {
    set({
      activeConversationId: null,
      activeKind: "chat",
      activeCompanionId: null,
      allMessages: [],
      currentLeafId: null,
      messages: [],
      conversationCost: new Map(),
      streamingText: null,
      errorText: null,
    });
  },

  resumeFromMessage(messageId) {
    set(resumeTreeState(get(), messageId));
  },

  returnToLatest() {
    set(returnToLatestTreeState(get()));
  },

  async sendMessage(content) {
    const settings = useSettingsStore.getState();
    if (!settings.networkEnabled) {
      set({ errorText: "当前处于离线模式。想继续对话，去设置里打开网络开关" });
      return;
    }
    if (!settings.apiConfig) {
      set({ errorText: "还没有配置 API。去设置页填写服务地址和密钥" });
      return;
    }
    const activeKind = get().activeKind;
    const entryCompanionId = get().activeCompanionId;
    if (activeKind === "companion" && !settings.featureSwitches.companionChat) {
      set({ errorText: COMPANION_DESKTOP_COPY.chatDisabled });
      return;
    }
    // Captured before anything can shift it: creating/switching the conversation below
    // triggers session reloads that clear the anchor, and extraction stamps provenance
    // with this value much later (spec 040 §7).
    const { useKnowledgeStore } = await import("./knowledgeStore");
    const roundAnchoredNodeId = useKnowledgeStore.getState().anchoredNodeId;
    // The whole round runs against this entry snapshot, and every UI set() below is guarded
    // by isRoundVisible() — switching conversations mid-round must never stream the old
    // reply into the newly opened one (it still lands in its own conversation in the DB).
    const entryConversationId = get().activeConversationId;
    const entryTree = {
      allMessages: get().allMessages,
      currentLeafId: get().currentLeafId,
      messages: get().messages,
    };
    const repos = await getRepos();
    const conversationId = await ensureChatConversationId(repos, entryConversationId, content);
    if (
      conversationId !== entryConversationId &&
      get().activeConversationId === entryConversationId
    )
      set({ activeConversationId: conversationId });
    const isRoundVisible = () => get().activeConversationId === conversationId;

    const { useCompanionStore } = await import("./companionStore");
    if (activeKind === "companion" || activeKind === "teach") {
      useCompanionStore.getState().checkUserMessageForCrisis(content);
    }
    // Replying in a companion chat accepts her pending invitation (Leo 2026-08-15): the
    // proposal resolves and the teach script seeds BEFORE the round's prompt is built, so
    // this very reply already runs in student teach-back mode.
    if (activeKind === "companion" && entryCompanionId !== null) {
      await useCompanionStore.getState().acceptProposalByReply(conversationId, entryCompanionId);
    }

    const userMessage = await appendUserMessage(repos, entryTree, conversationId, content);
    if (isRoundVisible() && !get().allMessages.some((m) => m.id === userMessage.id)) {
      set({ ...foldAppendedMessage(get(), userMessage), streamingText: "", errorText: null });
    }
    appEventBus.emit("chat:messageSent", {
      conversationId,
      messageId: userMessage.id,
      sentAt: userMessage.created_at,
    });

    try {
      const baseMessages: ChatMessage[] = [...entryTree.messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      // Teaching contract v2 (spec 038): teach/companion prompts branch inside runSendRound.
      const crisisActive =
        (activeKind === "companion" || activeKind === "teach") &&
        useCompanionStore.getState().crisisActive;
      let streamed = "";
      const { assistantMessage, cost } = await runSendRound({
        repos,
        activeKind,
        conversationId,
        userMessage,
        baseMessages,
        apiConfig: settings.apiConfig,
        companionScriptEnabled: settings.featureSwitches.companionScript,
        companionMemoryEnabled: settings.featureSwitches.companionMemory,
        crisisActive,
        onDelta: (delta) => {
          streamed += delta;
          if (isRoundVisible()) set({ streamingText: streamed });
        },
      });
      if (isRoundVisible()) {
        // A switch-away-and-back reloads from the DB, which may already hold this row.
        const alreadyLoaded = get().allMessages.some((m) => m.id === assistantMessage.id);
        set({
          ...(alreadyLoaded ? {} : foldAppendedMessage(get(), assistantMessage)),
          streamingText: null,
          conversationCost: cost.conversationCost,
          todayCost: cost.todayCost,
          conversations: cost.conversations,
        });
      } else {
        // The reply belongs to a conversation no longer on screen — global meters still move.
        set({ todayCost: cost.todayCost, conversations: cost.conversations });
      }
      appEventBus.emit("chat:responseFinished", {
        conversationId,
        messageId: assistantMessage.id,
        finishedAt: assistantMessage.created_at,
        anchoredNodeId: roundAnchoredNodeId,
      });
    } catch (error) {
      if (isRoundVisible()) {
        set({
          streamingText: null,
          errorText: `这次请求没有成功：${error instanceof Error ? error.message : String(error)}。休息一下再试，或检查设置里的 API 配置。`,
        });
      }
    }
  },
}));
