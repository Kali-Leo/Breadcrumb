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
      errorText: null,
    });
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
    if (activeKind === "companion" && !settings.featureSwitches.companionChat) {
      set({ errorText: COMPANION_DESKTOP_COPY.chatDisabled });
      return;
    }
    const repos = await getRepos();
    const conversationId = await ensureChatConversationId(
      repos,
      get().activeConversationId,
      content,
    );
    if (conversationId !== get().activeConversationId)
      set({ activeConversationId: conversationId });

    const { useCompanionStore } = await import("./companionStore");
    if (activeKind === "companion" || activeKind === "teach") {
      useCompanionStore.getState().checkUserMessageForCrisis(content);
    }

    const userMessage = await appendUserMessage(repos, get(), conversationId, content);
    set({ ...foldAppendedMessage(get(), userMessage), streamingText: "", errorText: null });
    appEventBus.emit("chat:messageSent", {
      conversationId,
      messageId: userMessage.id,
      sentAt: userMessage.created_at,
    });

    try {
      // Captured NOW: provenance stamping runs after async extraction, when the store's
      // anchor may long since have changed or cleared (spec 040 §7).
      const { useKnowledgeStore } = await import("./knowledgeStore");
      const roundAnchoredNodeId = useKnowledgeStore.getState().anchoredNodeId;
      const baseMessages: ChatMessage[] = get().messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      // Teaching contract v2 (spec 038): teach/companion prompts branch inside runSendRound.
      const crisisActive =
        (activeKind === "companion" || activeKind === "teach") &&
        useCompanionStore.getState().crisisActive;
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
        onDelta: (delta) => set({ streamingText: (get().streamingText ?? "") + delta }),
      });
      set({
        ...foldAppendedMessage(get(), assistantMessage),
        streamingText: null,
        conversationCost: cost.conversationCost,
        todayCost: cost.todayCost,
        conversations: cost.conversations,
      });
      appEventBus.emit("chat:responseFinished", {
        conversationId,
        messageId: assistantMessage.id,
        finishedAt: assistantMessage.created_at,
        anchoredNodeId: roundAnchoredNodeId,
      });
    } catch (error) {
      set({
        streamingText: null,
        errorText: `这次请求没有成功：${error instanceof Error ? error.message : String(error)}。休息一下再试，或检查设置里的 API 配置。`,
      });
    }
  },
}));
