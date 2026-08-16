/**
 * Purpose: the whole send round for one conversation (guards -> persist user turn -> LLM
 * stream -> persist reply -> meter -> bus), bound to its own session for its entire life —
 * extracted from chatStore so the store stays an orchestrator under the file-size cap.
 * Main exports: runChatSendPipeline, ChatSendDeps.
 */
import type { ConversationRow } from "@breadcrumb/core-db";
import type { ChatMessage } from "@breadcrumb/core-llm";
import { ensureChatConversationId } from "./chatRoundContext";
import { appendUserMessage, runSendRound } from "./chatSendRound";
import { type ChatSession, type CostByCurrency, freshChatSession } from "./chatSessions";
import { foldAppendedMessage } from "./chatTreeActions";
import { COMPANION_DESKTOP_COPY } from "./companionActions";
import { getRepos } from "./db";

/** What the pipeline needs from the store — session access and the two global meters. */
export interface ChatSendDeps {
  activeConversationId(): string | null;
  ensureSession(id: string): Promise<ChatSession>;
  patchSession(id: string, updater: (session: ChatSession) => ChatSession): void;
  putSession(id: string, session: ChatSession, makeActive: boolean): void;
  setRoundError(conversationId: string | null, errorText: string): void;
  setGlobalMeters(patch: { todayCost: CostByCurrency; conversations: ConversationRow[] }): void;
  emit(eventName: "chat:messageSent" | "chat:responseFinished", payload: never): void;
}

export async function runChatSendPipeline(
  deps: Omit<ChatSendDeps, "emit"> & {
    emitMessageSent(payload: { conversationId: string; messageId: string; sentAt: string }): void;
    emitResponseFinished(payload: {
      conversationId: string;
      messageId: string;
      finishedAt: string;
      anchoredNodeId: string | null;
    }): void;
  },
  content: string,
  targetConversationId: string | undefined,
): Promise<void> {
  const { useSettingsStore } = await import("../stores/settingsStore");
  const settings = useSettingsStore.getState();
  const requestedId = targetConversationId ?? deps.activeConversationId();
  if (!settings.networkEnabled) {
    deps.setRoundError(requestedId, "当前处于离线模式。想继续对话，去设置里打开网络开关");
    return;
  }
  if (!settings.apiConfig) {
    deps.setRoundError(requestedId, "还没有配置 API。去设置页填写服务地址和密钥");
    return;
  }
  // Captured before anything can shift it: extraction stamps provenance with this value
  // much later (spec 040 §7).
  const { useKnowledgeStore } = await import("../stores/knowledgeStore");
  const roundAnchoredNodeId = useKnowledgeStore.getState().anchoredNodeId;

  const repos = await getRepos();
  let conversationId: string;
  let session: ChatSession;
  if (requestedId === null) {
    conversationId = await ensureChatConversationId(repos, null, content);
    session = freshChatSession();
    // A draft main view follows its newborn conversation; other windows are unaffected.
    deps.putSession(conversationId, session, deps.activeConversationId() === null);
  } else {
    conversationId = requestedId;
    session = await deps.ensureSession(conversationId);
  }

  const kind = session.kind;
  if (kind === "companion" && !settings.featureSwitches.companionChat) {
    deps.setRoundError(conversationId, COMPANION_DESKTOP_COPY.chatDisabled);
    return;
  }
  const { useCompanionStore } = await import("../stores/companionStore");
  if (kind === "companion" || kind === "teach") {
    useCompanionStore.getState().checkUserMessageForCrisis(content, conversationId);
  }

  const entryTree = {
    allMessages: session.allMessages,
    currentLeafId: session.currentLeafId,
    messages: session.messages,
  };
  const userMessage = await appendUserMessage(repos, entryTree, conversationId, content);
  deps.patchSession(conversationId, (current) => ({
    ...current,
    ...(current.allMessages.some((m) => m.id === userMessage.id)
      ? {}
      : foldAppendedMessage(current, userMessage)),
    streamingText: "",
    errorText: null,
  }));
  deps.emitMessageSent({
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
      (kind === "companion" || kind === "teach") &&
      useCompanionStore.getState().crisisConversationIds.has(conversationId);
    let streamed = "";
    const { assistantMessage, cost } = await runSendRound({
      repos,
      activeKind: kind,
      conversationId,
      userMessage,
      baseMessages,
      apiConfig: settings.apiConfig,
      companionScriptEnabled: settings.featureSwitches.companionScript,
      companionMemoryEnabled: settings.featureSwitches.companionMemory,
      crisisActive,
      onDelta: (delta) => {
        streamed += delta;
        deps.patchSession(conversationId, (current) => ({ ...current, streamingText: streamed }));
      },
    });
    deps.patchSession(conversationId, (current) => ({
      ...current,
      ...(current.allMessages.some((m) => m.id === assistantMessage.id)
        ? {}
        : foldAppendedMessage(current, assistantMessage)),
      streamingText: null,
      conversationCost: cost.conversationCost,
    }));
    deps.setGlobalMeters({ todayCost: cost.todayCost, conversations: cost.conversations });
    deps.emitResponseFinished({
      conversationId,
      messageId: assistantMessage.id,
      finishedAt: assistantMessage.created_at,
      anchoredNodeId: roundAnchoredNodeId,
    });
  } catch (error) {
    deps.patchSession(conversationId, (current) => ({
      ...current,
      streamingText: null,
      errorText: `这次请求没有成功：${error instanceof Error ? error.message : String(error)}。休息一下再试，或检查设置里的 API 配置。`,
    }));
  }
}
