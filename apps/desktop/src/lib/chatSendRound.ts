/**
 * Purpose: runs the LLM half of one chat send round — system-message assembly, the streaming
 * completion (stop-aware: an aborted stream keeps its partial reply), assistant-message
 * persistence (parent = the triggering user message, spec 040 §1), conversation touch, and
 * cost metering — so chatStore.ts's sendMessage stays a thin orchestrator under the cap.
 * Main exports: SendRoundResult, appendUserMessage, runSendRound.
 */
import type { ConversationKind, MessageRow } from "@breadcrumb/core-db";
import { type ChatMessage, createLlmClient, type TokenUsage } from "@breadcrumb/core-llm";
import type { ApiConfig } from "../stores/settingsStore";
import { noteReplyLanguage, shouldUseFirmDirective } from "./answerLanguageWatch";
import {
  buildAnchoredNodeSystemMessage,
  buildFocusContextSystemMessage,
  buildLearnerContextSystemMessage,
} from "./chatRoundContext";
import { type RoundCostSnapshot, recordRoundCost } from "./chatRoundMetering";
import { isAbortError } from "./chatStreamControl";
import { resolveSendParentId, type TreeSlice } from "./chatTreeActions";
import { buildRoundSystemMessages } from "./companionChatPrompt";
import type { Repos } from "./db";
import { llmConfigFrom } from "./llmConfig";
import { newId, nowIso } from "./time";
import { refreshConversationAutoTitle } from "./trailNamingActions";

export interface SendRoundResult {
  assistantMessage: MessageRow;
  cost: RoundCostSnapshot;
  /** True when the user stopped the stream mid-reply (ChatGPT model): the streamed-so-far
   * content is persisted as the assistant message, usage is whatever the truncated stream
   * reported (normally zero — recorded as-is), and no error is surfaced. */
  stoppedEarly: boolean;
}

/** Builds and persists the round's user message; parent = the current station (spec 040 §2),
 * so resuming mid-tree forks a new branch instead of overwriting what followed the old leaf. */
export async function appendUserMessage(
  repos: Pick<Repos, "messages">,
  tree: TreeSlice,
  conversationId: string,
  content: string,
): Promise<MessageRow> {
  const userMessage: MessageRow = {
    id: newId(),
    conversation_id: conversationId,
    role: "user",
    content,
    created_at: nowIso(),
    teaching_mode: null,
    parent_id: resolveSendParentId(tree),
  };
  await repos.messages.append(userMessage);
  return userMessage;
}

export async function runSendRound(params: {
  repos: Repos;
  activeKind: ConversationKind;
  conversationId: string;
  userMessage: MessageRow;
  baseMessages: ChatMessage[];
  apiConfig: ApiConfig;
  companionScriptEnabled: boolean;
  companionMemoryEnabled: boolean;
  crisisActive: boolean;
  /** The session's 学习模式 state (spec 052); false on a chat round = free chat, no teaching
   * program, no learner/focus context injection. */
  studyMode: boolean;
  onDelta: (delta: string) => void;
  /** Wired to the round's stop button; aborting it resolves the round early (or to null). */
  signal?: AbortSignal;
}): Promise<SendRoundResult | null> {
  const { repos, activeKind, conversationId, userMessage, apiConfig } = params;

  // System messages, in unshift order: kind prompt(s) -> anchored node -> learner context
  // (spec 038 §2.3), so the most specific-to-this-round line ends up closest to the user turn.
  const history = [...params.baseMessages];
  history.unshift(
    ...(await buildRoundSystemMessages({
      repos,
      activeKind,
      conversationId,
      content: userMessage.content,
      apiConfig,
      companionScriptEnabled: params.companionScriptEnabled,
      companionMemoryEnabled: params.companionMemoryEnabled,
      crisisActive: params.crisisActive,
      studyMode: params.studyMode,
    })),
  );
  const anchoredMessage = await buildAnchoredNodeSystemMessage();
  if (anchoredMessage) history.unshift(anchoredMessage);
  // 学习模式 gate (spec 052): a free chat round carries no learner-context or focus-context
  // steering — silent measurement continues elsewhere, but nothing shapes the reply.
  if (activeKind === "chat" && params.studyMode) {
    // Neither is persisted (spec 038 §2.3 precedent): both are assembled fresh every round and
    // only ever live in this round's outgoing history.
    const focusContextMessage = await buildFocusContextSystemMessage(conversationId);
    if (focusContextMessage) history.unshift(focusContextMessage);
    const learnerContextMessage = await buildLearnerContextSystemMessage(userMessage.content);
    if (learnerContextMessage) history.unshift(learnerContextMessage);
  }

  const client = createLlmClient(
    llmConfigFrom(apiConfig, { firm: shouldUseFirmDirective(conversationId) }),
  );
  let content: string;
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  let stoppedEarly = false;
  let streamedSoFar = "";
  try {
    const result = await client.chatStream(
      history,
      (delta) => {
        streamedSoFar += delta;
        params.onDelta(delta);
      },
      { signal: params.signal },
    );
    content = result.content;
    usage = result.usage;
  } catch (error) {
    if (!isAbortError(error)) throw error;
    // Stop semantics (ChatGPT model): keep the partial reply and run the normal persist +
    // meter path below. A stop before the first delta keeps nothing — the round dissolves.
    if (streamedSoFar.length === 0) return null;
    content = streamedSoFar;
    stoppedEarly = true;
  }

  // Did it write in the language we asked for? (spec 058 §1 — the check, not a rewrite.)
  if (!stoppedEarly) noteReplyLanguage(conversationId, content);

  const assistantMessage: MessageRow = {
    id: newId(),
    conversation_id: conversationId,
    role: "assistant",
    content,
    created_at: nowIso(),
    // Column kept dormant for future silent experiments (spec 038 revision 2026-08-14).
    teaching_mode: null,
    // A reply's parent is always the user message that triggered it (spec 040 §1).
    parent_id: userMessage.id,
  };
  await repos.messages.append(assistantMessage);
  await repos.conversations.touch(conversationId, assistantMessage.created_at);

  // Trail-card auto-naming (spec 041 §1) — reads whatever stations already exist; the round's
  // own stations (if any) land a moment later via knowledge:nodesExtracted's own refresh.
  const { useKnowledgeStore } = await import("../stores/knowledgeStore");
  const labelsByNode = new Map(
    useKnowledgeStore.getState().nodes.map((node) => [node.id, node.label]),
  );
  await refreshConversationAutoTitle(repos, conversationId, labelsByNode);

  const cost = await recordRoundCost(repos, {
    conversationId,
    purpose: activeKind === "companion" ? "companion-chat" : "chat",
    model: apiConfig.model,
    usage,
    responseHadContent: assistantMessage.content.length > 0,
  });

  return { assistantMessage, cost, stoppedEarly };
}
