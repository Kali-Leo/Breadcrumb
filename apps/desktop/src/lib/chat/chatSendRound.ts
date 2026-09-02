/**
 * Purpose: runs the LLM half of one chat send round — system-message assembly, the streaming
 * completion (stop-aware: an aborted stream keeps its partial reply), assistant-message
 * persistence (parent = the triggering user message, spec 040 §1), conversation touch, and
 * cost metering — so chatStore.ts's sendMessage stays a thin orchestrator under the cap.
 * Main exports: SendRoundResult, appendUserMessage, runSendRound.
 */
import type { ConversationKind, MessageRow } from "@breadcrumb/core-db";
import { type ChatMessage, createLlmClient, type TokenUsage } from "@breadcrumb/core-llm";
import type { ApiConfig } from "../../stores/settingsStore";
import { buildRoundSystemMessages } from "../companion/companionChatPrompt";
import { noteReplyLanguage, shouldUseFirmDirective } from "../platform/answerLanguageWatch";
import type { Repos } from "../platform/db";
import { llmConfigFrom } from "../platform/llmConfig";
import { newId, nowIso } from "../platform/time";
import { refreshConversationAutoTitle } from "../trail/trailNamingActions";
import {
  buildAnchoredNodeSystemMessage,
  buildFocusContextSystemMessage,
  buildLearnerContextSystemMessage,
} from "./chatRoundContext";
import { type RoundCostSnapshot, recordRoundCost } from "./chatRoundMetering";
import { isAbortError } from "./chatStreamControl";
import { resolveSendParentId, type TreeSlice } from "./chatTreeActions";

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

  // Stable content first, volatile content last — that is what makes provider prefix caching
  // possible at all. DeepSeek only counts a request as a cache hit when the prefix matches
  // "starting from the 0th token", and a hit costs ~1/50th of a miss, so the kind prompt(s)
  // and the teaching contract are pinned at index 0 and the per-round steering lines are kept
  // out of the way: contract + prior turns stays byte-identical from one round to the next.
  const contractMessages = await buildRoundSystemMessages({
    repos,
    activeKind,
    conversationId,
    content: userMessage.content,
    apiConfig,
    companionScriptEnabled: params.companionScriptEnabled,
    companionMemoryEnabled: params.companionMemoryEnabled,
    crisisActive: params.crisisActive,
    studyMode: params.studyMode,
  });

  // Rebuilt every round and never persisted (spec 038 §2.3 precedent). These sit immediately
  // before the round's user turn: last thing the model reads, and behind the cached prefix.
  const perRoundSteering: ChatMessage[] = [];
  // 学习模式 gate (spec 052): a free chat round carries no learner-context or focus-context
  // steering — silent measurement continues elsewhere, but nothing shapes the reply.
  if (activeKind === "chat" && params.studyMode) {
    const learnerContextMessage = await buildLearnerContextSystemMessage(userMessage.content);
    if (learnerContextMessage) perRoundSteering.push(learnerContextMessage);
    const focusContextMessage = await buildFocusContextSystemMessage(conversationId);
    if (focusContextMessage) perRoundSteering.push(focusContextMessage);
  }
  const anchoredMessage = await buildAnchoredNodeSystemMessage();
  if (anchoredMessage) perRoundSteering.push(anchoredMessage);

  // baseMessages always ends with this round's user message (see chatAssistantRound), so the
  // steering slides in just ahead of it. The language directive is appended after everything
  // by the client itself (spec 058 §1) and stays where it is.
  const priorTurns = params.baseMessages.slice(0, -1);
  const userTurn = params.baseMessages.slice(-1);
  const history = [...contractMessages, ...priorTurns, ...perRoundSteering, ...userTurn];

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
  // Fire-and-forget: the verdict only hardens the *next* round's directive, so the reader
  // never waits on the detector loading.
  if (!stoppedEarly) void noteReplyLanguage(conversationId, content);

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
  const { useKnowledgeStore } = await import("../../stores/knowledgeStore");
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
