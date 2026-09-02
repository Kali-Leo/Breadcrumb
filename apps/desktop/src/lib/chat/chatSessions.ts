/**
 * Purpose: per-conversation chat session shape and helpers (the mainstream model: every
 * conversation owns its runtime state — message tree, streaming buffer, error, cost —
 * keyed by conversation id; views merely bind to a session). Extracted so chatStore stays
 * an orchestrator under the file-size cap.
 * Main exports: ChatSession, ActiveMirror, EMPTY_ACTIVE_MIRROR, mirrorOf, freshChatSession,
 * loadChatSession.
 */
import type { ConversationKind, Currency, MessageRow } from "@breadcrumb/core-db";
import type { CopyMessage } from "@breadcrumb/core-i18n";
import type { Repos } from "../platform/db";
import { deriveActiveMessages } from "./chatTreeActions";
import { newestLeafId } from "./messageTree";

export type CostByCurrency = ReadonlyMap<Currency, number>;

/** One conversation's full runtime state. The store holds one per open conversation; a
 * round writes only into its own session, so nothing can cross-wire between windows. */
export interface ChatSession {
  kind: ConversationKind;
  companionId: string | null;
  /** The 学习模式 toggle (spec 052), chat kind only — runtime source of truth for a round's
   * prompt regime; persisted through conversations.study_mode. */
  studyMode: boolean;
  /** Every row, tree edges and all (spec 040 §1). */
  allMessages: MessageRow[];
  /** Current station; null = the newest leaf (spec 040 §1). */
  currentLeafId: string | null;
  /** The active path — renders and feeds LLM history. */
  messages: MessageRow[];
  streamingText: string | null;
  errorText: CopyMessage | null;
  conversationCost: CostByCurrency;
}

/** The top-level fields older components still read — always a faithful mirror of the
 * ACTIVE session, updated through the store's single session write path. */
export interface ActiveMirror {
  activeKind: ConversationKind;
  activeCompanionId: string | null;
  allMessages: MessageRow[];
  currentLeafId: string | null;
  messages: MessageRow[];
  streamingText: string | null;
  errorText: CopyMessage | null;
  conversationCost: CostByCurrency;
}

export const EMPTY_ACTIVE_MIRROR: ActiveMirror = {
  activeKind: "chat",
  activeCompanionId: null,
  allMessages: [],
  currentLeafId: null,
  messages: [],
  streamingText: null,
  errorText: null,
  conversationCost: new Map(),
};

export function mirrorOf(session: ChatSession): ActiveMirror {
  return {
    activeKind: session.kind,
    activeCompanionId: session.companionId,
    allMessages: session.allMessages,
    currentLeafId: session.currentLeafId,
    messages: session.messages,
    streamingText: session.streamingText,
    errorText: session.errorText,
    conversationCost: session.conversationCost,
  };
}

/** A just-created conversation's session — nothing persisted beyond the row itself yet. */
export function freshChatSession(studyMode = false): ChatSession {
  return {
    kind: "chat",
    companionId: null,
    studyMode,
    allMessages: [],
    currentLeafId: null,
    messages: [],
    streamingText: null,
    errorText: null,
    conversationCost: new Map(),
  };
}

/** Loads one conversation's session from the database ("reopen lands where you left off",
 * spec 040 §1: the newest leaf's path). */
export async function loadChatSession(repos: Repos, id: string): Promise<ChatSession> {
  const [allMessages, conversationCost, conversation] = await Promise.all([
    repos.messages.listByConversation(id),
    repos.llmCalls.sumCostForConversation(id),
    repos.conversations.getById(id),
  ]);
  const currentLeafId = newestLeafId(allMessages);
  return {
    kind: conversation?.kind ?? "chat",
    companionId: conversation?.companion_id ?? null,
    studyMode: (conversation?.study_mode ?? 0) === 1,
    allMessages,
    currentLeafId,
    messages: deriveActiveMessages({ allMessages, currentLeafId }),
    streamingText: null,
    errorText: null,
    conversationCost,
  };
}
