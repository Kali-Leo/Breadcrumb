/**
 * Purpose: the whole send round for one conversation (concurrency gate -> guards -> persist
 * user turn -> clear that conversation's draft -> assistant half via runAssistantRound),
 * bound to its own session for its entire life — extracted from chatStore so the store stays
 * an orchestrator under the file-size cap.
 * Main exports: runChatSendPipeline, ChatSendDeps.
 */

import type { CopyMessage } from "@breadcrumb/core-i18n";
import { getRepos } from "../platform/db";
import {
  type AssistantRoundDeps,
  CHAT_ROUND_GUARD_COPY,
  runAssistantRound,
} from "./chatAssistantRound";
import { ensureChatConversationId } from "./chatRoundContext";
import { appendUserMessage } from "./chatSendRound";
import { type ChatSession, freshChatSession } from "./chatSessions";
import { foldAppendedMessage } from "./chatTreeActions";

/** What the pipeline needs from the store — session access, drafts, and the global meters. */
export interface ChatSendDeps extends AssistantRoundDeps {
  activeConversationId(): string | null;
  ensureSession(id: string): Promise<ChatSession>;
  putSession(id: string, session: ChatSession, makeActive: boolean): void;
  setRoundError(conversationId: string | null, errorText: CopyMessage): void;
  /** Clears the draft of the composer this send was bound to (null = new-conversation). */
  clearDraft(conversationKey: string | null): void;
  /** The new-conversation composer's 学习模式 state (spec 052) — a brand-new conversation
   * is born with whatever the toggle showed when the first message was sent. */
  readNewConversationStudyMode(): boolean;
  emitMessageSent(payload: { conversationId: string; messageId: string; sentAt: string }): void;
}

/** Composers currently mid-send, keyed by the conversation the send was bound to (null = the
 * new-conversation composer). Module-level because a second window addressing the same
 * conversation has its own component tree but not its own round. */
const sendsInFlight = new Set<string | null>();

/**
 * One send, from the guards to the assistant's last token. Re-entrant calls for the SAME
 * conversation are dropped: a double-clicked 发送 (or a second window) otherwise persisted two
 * user messages against one question and billed two answers, and the second round took the
 * first one's stop button with it. The gate closes synchronously, before the first await, so
 * two clicks in one tick cannot both get through.
 */
export async function runChatSendPipeline(
  deps: ChatSendDeps,
  content: string,
  targetConversationId: string | undefined,
): Promise<void> {
  const requestedId = targetConversationId ?? deps.activeConversationId();
  if (sendsInFlight.has(requestedId)) return;
  sendsInFlight.add(requestedId);
  try {
    await sendRound(deps, content, requestedId);
  } finally {
    sendsInFlight.delete(requestedId);
  }
}

async function sendRound(
  deps: ChatSendDeps,
  content: string,
  requestedId: string | null,
): Promise<void> {
  const { useSettingsStore } = await import("../../stores/settingsStore");
  const settings = useSettingsStore.getState();
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
  const { useKnowledgeStore } = await import("../../stores/knowledgeStore");
  const roundAnchoredNodeId = useKnowledgeStore.getState().anchoredNodeId;

  const repos = await getRepos();
  let conversationId: string;
  let session: ChatSession;
  if (requestedId === null) {
    const studyMode = deps.readNewConversationStudyMode();
    conversationId = await ensureChatConversationId(repos, null, content, studyMode);
    session = freshChatSession(studyMode);
    // A draft main view follows its newborn conversation; other windows are unaffected.
    deps.putSession(conversationId, session, deps.activeConversationId() === null);
  } else {
    conversationId = requestedId;
    session = await deps.ensureSession(conversationId);
  }

  const kind = session.kind;
  if (kind === "companion" && !settings.featureSwitches.companionChat) {
    deps.setRoundError(conversationId, { key: "chat:companion.chatDisabled" });
    return;
  }
  const { useCompanionStore } = await import("../../stores/companionStore");
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
    studyMode: session.studyMode,
    roundAnchoredNodeId,
  });
}
