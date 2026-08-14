/**
 * Purpose: zustand store driving the chat flow — conversations, messages, streaming state,
 * cost meters, and the full send pipeline (persist -> LLM stream -> persist -> meter -> bus).
 * Main exports: useChatStore, appEventBus.
 */
import { createEventBus } from "@breadcrumb/core-bus";
import type { ConversationKind, ConversationRow, Currency, MessageRow } from "@breadcrumb/core-db";
import { type ChatMessage, createLlmClient } from "@breadcrumb/core-llm";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { create } from "zustand";
import {
  buildAnchoredNodeSystemMessage,
  buildLearnerContextSystemMessage,
  ensureChatConversationId,
} from "../lib/chatRoundContext";
import { recordRoundCost } from "../lib/chatRoundMetering";
import { COMPANION_DESKTOP_COPY } from "../lib/companionActions";
import { buildRoundSystemMessages } from "../lib/companionChatPrompt";
import { getRepos } from "../lib/db";
import { newId, nowIso, todayLocalMidnightIso } from "../lib/time";
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
  messages: MessageRow[];
  streamingText: string | null;
  errorText: string | null;
  conversationCost: CostByCurrency;
  todayCost: CostByCurrency;
  loadFromDatabase(): Promise<void>;
  openConversation(id: string): Promise<void>;
  startNewConversation(): void;
  sendMessage(content: string): Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  activeKind: "chat",
  activeCompanionId: null,
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
    const [messages, conversationCost, conversation] = await Promise.all([
      repos.messages.listByConversation(id),
      repos.llmCalls.sumCostForConversation(id),
      repos.conversations.getById(id),
    ]);
    set({
      activeConversationId: id,
      activeKind: conversation?.kind ?? "chat",
      activeCompanionId: conversation?.companion_id ?? null,
      messages,
      conversationCost,
      errorText: null,
    });
  },

  startNewConversation() {
    set({
      activeConversationId: null,
      activeKind: "chat",
      activeCompanionId: null,
      messages: [],
      conversationCost: new Map(),
      errorText: null,
    });
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

    const userMessage: MessageRow = {
      id: newId(),
      conversation_id: conversationId,
      role: "user",
      content,
      created_at: nowIso(),
      teaching_mode: null,
    };
    await repos.messages.append(userMessage);
    set({ messages: [...get().messages, userMessage], streamingText: "", errorText: null });
    appEventBus.emit("chat:messageSent", {
      conversationId,
      messageId: userMessage.id,
      sentAt: userMessage.created_at,
    });

    try {
      const client = createLlmClient({ ...settings.apiConfig, fetchImpl: tauriFetch });
      const history: ChatMessage[] = get().messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      // Teaching contract v2 (spec 038) lives in each prompt builder below; teach (spec 034)
      // and companion_id-bearing conversations (spec 037) branch inside buildRoundSystemMessages.
      const crisisActive =
        (activeKind === "companion" || activeKind === "teach") &&
        useCompanionStore.getState().crisisActive;
      const systemMessages = await buildRoundSystemMessages({
        repos,
        activeKind,
        conversationId,
        content,
        apiConfig: settings.apiConfig,
        companionScriptEnabled: settings.featureSwitches.companionScript,
        companionMemoryEnabled: settings.featureSwitches.companionMemory,
        crisisActive,
      });
      history.unshift(...systemMessages);
      // Anchored knowledge node (if any) steers this round without polluting stored history.
      const anchoredMessage = await buildAnchoredNodeSystemMessage();
      if (anchoredMessage) history.unshift(anchoredMessage);
      // Learner context (spec 038 §2.3): retention stance, style preferences, confusion
      // downshift — plain 'chat' rounds only, same not-persisted pattern as anchoring.
      if (activeKind === "chat") {
        const learnerContextMessage = await buildLearnerContextSystemMessage(content);
        if (learnerContextMessage) history.unshift(learnerContextMessage);
      }
      const result = await client.chatStream(history, (delta) => {
        set({ streamingText: (get().streamingText ?? "") + delta });
      });

      const assistantMessage: MessageRow = {
        id: newId(),
        conversation_id: conversationId,
        role: "assistant",
        content: result.content,
        created_at: nowIso(),
        // Column kept dormant for future silent experiments (spec 038 revision 2026-08-14).
        teaching_mode: null,
      };
      await repos.messages.append(assistantMessage);
      await repos.conversations.touch(conversationId, assistantMessage.created_at);

      const { conversationCost, todayCost, conversations } = await recordRoundCost(repos, {
        conversationId,
        purpose: activeKind === "companion" ? "companion-chat" : "chat",
        model: settings.apiConfig.model,
        usage: result.usage,
      });
      set({
        messages: [...get().messages, assistantMessage],
        streamingText: null,
        conversationCost,
        todayCost,
        conversations,
      });
      appEventBus.emit("chat:responseFinished", {
        conversationId,
        messageId: assistantMessage.id,
        finishedAt: assistantMessage.created_at,
      });
    } catch (error) {
      set({
        streamingText: null,
        errorText: `这次请求没有成功：${error instanceof Error ? error.message : String(error)}。休息一下再试，或检查设置里的 API 配置。`,
      });
    }
  },
}));
