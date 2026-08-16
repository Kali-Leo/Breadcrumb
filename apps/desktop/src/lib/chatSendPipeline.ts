/**
 * Purpose: the whole send round for one conversation (guards -> persist user turn -> clear
 * that conversation's draft -> assistant half via runAssistantRound), bound to its own
 * session for its entire life — extracted from chatStore so the store stays an orchestrator
 * under the file-size cap.
 * Main exports: runChatSendPipeline, ChatSendDeps.
 */
import {
  type AssistantRoundDeps,
  CHAT_ROUND_GUARD_COPY,
  runAssistantRound,
} from "./chatAssistantRound";
import { ensureChatConversationId } from "./chatRoundContext";
import { appendUserMessage } from "./chatSendRound";
import { type ChatSession, freshChatSession } from "./chatSessions";
import { foldAppendedMessage } from "./chatTreeActions";
import { COMPANION_DESKTOP_COPY } from "./companionActions";
import { getRepos } from "./db";

/** What the pipeline needs from the store — session access, drafts, and the global meters. */
export interface ChatSendDeps extends AssistantRoundDeps {
  activeConversationId(): string | null;
  ensureSession(id: string): Promise<ChatSession>;
  putSession(id: string, session: ChatSession, makeActive: boolean): void;
  setRoundError(conversationId: string | null, errorText: string): void;
  /** Clears the draft of the composer this send was bound to (null = new-conversation). */
  clearDraft(conversationKey: string | null): void;
  emitMessageSent(payload: { conversationId: string; messageId: string; sentAt: string }): void;
}

export async function runChatSendPipeline(
  deps: ChatSendDeps,
  content: string,
  targetConversationId: string | undefined,
): Promise<void> {
  const { useSettingsStore } = await import("../stores/settingsStore");
  const settings = useSettingsStore.getState();
  const requestedId = targetConversationId ?? deps.activeConversationId();
  if (!settings.networkEnabled) {
    deps.setRoundError(requestedId, CHAT_ROUND_GUARD_COPY.offline);
    return;
  }
  if (!settings.apiConfig) {
    deps.setRoundError(requestedId, CHAT_ROUND_GUARD_COPY.noApiConfig);
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
  // The draft is cleared only now — a send that failed its guards above keeps the text
  // (WeChat/Discord model), keyed by the composer's own binding, not the new conversation.
  deps.clearDraft(requestedId);
  deps.emitMessageSent({
    conversationId,
    messageId: userMessage.id,
    sentAt: userMessage.created_at,
  });

  // Teaching contract v2 (spec 038): teach/companion prompts branch inside runSendRound.
  const crisisActive =
    (kind === "companion" || kind === "teach") &&
    useCompanionStore.getState().crisisConversationIds.has(conversationId);
  await runAssistantRound(deps, {
    repos,
    conversationId,
    kind,
    userMessage,
    historyBeforeUser: entryTree.messages,
    apiConfig: settings.apiConfig,
    companionScriptEnabled: settings.featureSwitches.companionScript,
    companionMemoryEnabled: settings.featureSwitches.companionMemory,
    crisisActive,
    roundAnchoredNodeId,
  });
}
