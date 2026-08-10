/**
 * Purpose: zustand store driving the chat flow — conversations, messages, streaming state,
 * cost meters, and the full send pipeline (persist -> LLM stream -> persist -> meter -> bus).
 * Main exports: useChatStore, appEventBus.
 */
import { createEventBus } from "@breadcrumb/core-bus";
import type { ConversationRow, Currency, MessageRow } from "@breadcrumb/core-db";
import {
  BUILTIN_MODEL_PRICES,
  type ChatMessage,
  calculateCostMicros,
  createLlmClient,
} from "@breadcrumb/core-llm";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { newId, nowIso, todayLocalMidnightIso } from "../lib/time";
import { useSettingsStore } from "./settingsStore";

export const appEventBus = createEventBus();

export type CostByCurrency = ReadonlyMap<Currency, number>;

interface ChatState {
  conversations: ConversationRow[];
  activeConversationId: string | null;
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
    const [messages, conversationCost] = await Promise.all([
      repos.messages.listByConversation(id),
      repos.llmCalls.sumCostForConversation(id),
    ]);
    set({ activeConversationId: id, messages, conversationCost, errorText: null });
  },

  startNewConversation() {
    set({ activeConversationId: null, messages: [], conversationCost: new Map(), errorText: null });
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
    const repos = await getRepos();

    // Ensure a conversation exists (created lazily on first message).
    let conversationId = get().activeConversationId;
    if (conversationId === null) {
      conversationId = newId();
      const title = content.length > 20 ? `${content.slice(0, 20)}…` : content;
      await repos.conversations.create({
        id: conversationId,
        title,
        created_at: nowIso(),
        updated_at: nowIso(),
        kind: "chat",
      });
      set({ activeConversationId: conversationId });
    }

    const userMessage: MessageRow = {
      id: newId(),
      conversation_id: conversationId,
      role: "user",
      content,
      created_at: nowIso(),
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
      // Standing tone contract (Leo 2026-08-02): plain and matter-of-fact — one short
      // positive instruction, no stacked prohibitions (they degrade the model's real work).
      history.unshift({
        role: "system",
        content:
          "你是 Breadcrumb 的学习伙伴。语气平实、就事论事，不评判也不夸赞学习者；" +
          "讲解清楚、循序，从对方当前的理解出发。",
      });
      // Anchored knowledge node (if any) steers this round without polluting stored history.
      const { useKnowledgeStore } = await import("./knowledgeStore");
      const knowledge = useKnowledgeStore.getState();
      const anchoredNode = knowledge.nodes.find((node) => node.id === knowledge.anchoredNodeId);
      if (anchoredNode) {
        history.unshift({
          role: "system",
          content: `学习者当前锚定的知识点：「${anchoredNode.label}」（${anchoredNode.summary}）。请围绕这个知识点展开回答。`,
        });
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
      };
      await repos.messages.append(assistantMessage);
      await repos.conversations.touch(conversationId, assistantMessage.created_at);

      const price = BUILTIN_MODEL_PRICES[settings.apiConfig.model];
      await repos.llmCalls.record({
        id: newId(),
        conversation_id: conversationId,
        purpose: "chat",
        model: settings.apiConfig.model,
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        cost_micros: price ? calculateCostMicros(result.usage, price) : 0,
        currency: price?.currency ?? "CNY",
        created_at: nowIso(),
      });

      const [conversationCost, todayCost, conversations] = await Promise.all([
        repos.llmCalls.sumCostForConversation(conversationId),
        repos.llmCalls.sumCostSince(todayLocalMidnightIso()),
        repos.conversations.listByKind("chat"),
      ]);
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
