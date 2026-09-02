/**
 * Purpose: the assistant half of a chat round (build history -> stream -> persist -> meter ->
 * bus, with stop and error handling), shared by the send pipeline and by retry — retry re-runs
 * ONLY this half against the already-persisted user leaf, never appending a new user message.
 * Main exports: AssistantRoundDeps, runAssistantRound, runChatRetryRound, findRetryUserLeaf,
 * CHAT_ROUND_GUARD_COPY.
 */
import type { ConversationKind, ConversationRow, MessageRow } from "@breadcrumb/core-db";
import type { CopyMessage } from "@breadcrumb/core-i18n";
import type { ChatMessage } from "@breadcrumb/core-llm";
import type { ApiConfig } from "../../stores/settingsStore";
import { getRepos, type Repos } from "../platform/db";
import { recordAiFailure } from "../platform/failureLog";
import { runSendRound } from "./chatSendRound";
import type { ChatSession, CostByCurrency } from "./chatSessions";
import { beginStreamControl, endStreamControl, isAbortError } from "./chatStreamControl";
import { foldAppendedMessage } from "./chatTreeActions";

/** Round guards shared by first send and retry — one wording, one place. */
/** The two reasons a round cannot start, as catalogue keys — the components render them. */
export const CHAT_ROUND_GUARD_COPY = {
  offline: { key: "chat:errors.offline" },
  noApiConfig: { key: "chat:errors.noApiConfig" },
} as const satisfies Record<string, CopyMessage>;

/** What the assistant half needs from the store — a subset of the pipeline's ChatSendDeps. */
export interface AssistantRoundDeps {
  patchSession(id: string, updater: (session: ChatSession) => ChatSession): void;
  setGlobalMeters(patch: { todayCost: CostByCurrency; conversations: ConversationRow[] }): void;
  emitResponseFinished(payload: {
    conversationId: string;
    messageId: string;
    finishedAt: string;
    anchoredNodeId: string | null;
  }): void;
}

export async function runAssistantRound(
  deps: AssistantRoundDeps,
  args: {
    repos: Repos;
    conversationId: string;
    kind: ConversationKind;
    userMessage: MessageRow;
    /** The active path up to (excluding) the round's user message. */
    historyBeforeUser: readonly MessageRow[];
    apiConfig: ApiConfig;
    companionScriptEnabled: boolean;
    companionMemoryEnabled: boolean;
    crisisActive: boolean;
    /** The session's 学习模式 state (spec 052), threaded through to prompt assembly. */
    studyMode: boolean;
    roundAnchoredNodeId: string | null;
  },
): Promise<void> {
  const { conversationId } = args;
  const controller = beginStreamControl(conversationId);
  try {
    const baseMessages: ChatMessage[] = [...args.historyBeforeUser, args.userMessage].map((m) => ({
      role: m.role,
      content: m.content,
    }));
    let streamed = "";
    const outcome = await runSendRound({
      repos: args.repos,
      activeKind: args.kind,
      conversationId,
      userMessage: args.userMessage,
      baseMessages,
      apiConfig: args.apiConfig,
      companionScriptEnabled: args.companionScriptEnabled,
      companionMemoryEnabled: args.companionMemoryEnabled,
      crisisActive: args.crisisActive,
      studyMode: args.studyMode,
      signal: controller.signal,
      onDelta: (delta) => {
        streamed += delta;
        deps.patchSession(conversationId, (current) => ({ ...current, streamingText: streamed }));
      },
    });
    if (outcome === null) {
      // Stopped before anything streamed — nothing persisted, no banner (ChatGPT model).
      deps.patchSession(conversationId, (current) => ({ ...current, streamingText: null }));
      return;
    }
    const { assistantMessage, cost } = outcome;
    // Diglot weave timing (Leo 2026-08-16): stream end is the single legitimate swap
    // moment — the weave (base + refine under its hard internal timeout) must be ready
    // BEFORE streamingText is replaced by the persisted message, so the final text appears
    // woven exactly once. Returns immediately while weaving is disabled, so the swap is
    // never delayed then. Dynamic import: diglotStore statically imports chatStore.
    const { useDiglotStore } = await import("../../stores/diglotStore");
    await useDiglotStore
      .getState()
      .ensureWovenBeforeReveal(assistantMessage.id, assistantMessage.content);
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
      anchoredNodeId: args.roundAnchoredNodeId,
    });
  } catch (error) {
    // Belt over suspenders: runSendRound already absorbs stream aborts; one escaping from a
    // surrounding await must still never surface as an error banner.
    if (isAbortError(error)) {
      deps.patchSession(conversationId, (current) => ({ ...current, streamingText: null }));
      return;
    }
    await recordAiFailure("chat", error);
    deps.patchSession(conversationId, (current) => ({
      ...current,
      streamingText: null,
      errorText: { key: "chat:errors.requestFailed" },
    }));
  } finally {
    endStreamControl(conversationId, controller);
  }
}

/** The user message a retry would re-run against, or null when the session has nothing to
 * retry (mid-stream, or the leaf is not a user turn). Deliberately shape-derived rather than
 * errorText-derived: a reload (switch back, app restart) drops runtime error state, but an
 * unanswered user leaf is still visibly unanswered and must stay retryable. Pure — unit
 * tested. */
export function findRetryUserLeaf(
  session: Pick<ChatSession, "streamingText" | "messages">,
): MessageRow | null {
  if (session.streamingText !== null) return null;
  const leaf = session.messages.at(-1);
  return leaf !== undefined && leaf.role === "user" ? leaf : null;
}

/** Re-runs a failed round's assistant half (the main chat's parity with the focus overlay's
 * retryCurrent). The user message is already persisted as the current leaf — nothing is
 * appended; guards mirror the send pipeline's. */
export async function runChatRetryRound(
  deps: AssistantRoundDeps & {
    setRoundError(conversationId: string | null, errorText: CopyMessage): void;
  },
  conversationId: string,
  session: ChatSession,
): Promise<void> {
  const userMessage = findRetryUserLeaf(session);
  if (userMessage === null) return;
  const { useSettingsStore } = await import("../../stores/settingsStore");
  const settings = useSettingsStore.getState();
  if (!settings.networkEnabled) {
    deps.setRoundError(conversationId, CHAT_ROUND_GUARD_COPY.offline);
    return;
  }
  if (!settings.apiConfig) {
    deps.setRoundError(conversationId, CHAT_ROUND_GUARD_COPY.noApiConfig);
    return;
  }
  const { useKnowledgeStore } = await import("../../stores/knowledgeStore");
  const { useCompanionStore } = await import("../../stores/companionStore");
  const kind = session.kind;
  const crisisActive =
    (kind === "companion" || kind === "teach") &&
    useCompanionStore.getState().crisisConversationIds.has(conversationId);
  deps.patchSession(conversationId, (current) => ({
    ...current,
    streamingText: "",
    errorText: null,
  }));
  await runAssistantRound(deps, {
    repos: await getRepos(),
    conversationId,
    kind,
    userMessage,
    historyBeforeUser: session.messages.slice(0, -1),
    apiConfig: settings.apiConfig,
    companionScriptEnabled: settings.featureSwitches.companionScript,
    companionMemoryEnabled: settings.featureSwitches.companionMemory,
    crisisActive,
    studyMode: session.studyMode,
    roundAnchoredNodeId: useKnowledgeStore.getState().anchoredNodeId,
  });
}
