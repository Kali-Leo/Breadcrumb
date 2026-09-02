/**
 * Purpose: row types for the conversation domain — the settings key/value store, conversations
 * and their messages, and the llm_calls spending ledger those conversations produce.
 * Main exports: SettingRow, ConversationKind, ConversationRow, MessageRow, LlmCallRow.
 */
import type { Currency, MessageRole } from "./types";

export interface SettingRow {
  key: string;
  value_json: string;
  updated_at: string;
}

/** 'chat' = an ordinary conversation, listed in the sidebar. 'practice' = a discussion opened
 * from a practice item (spec 026) — saved like any other conversation but hidden from the
 * sidebar's chat list, since it is a temporary offshoot of one practice leaf, not a standing
 * learning thread. 'teach' = a teach-back session (spec 034); when its companion_id is set
 * the student side is played by the Shichimi companion card (spec 037) instead of the
 * generic teach prompt. 'companion' = a chat opened with one of the three companion cards. */
export type ConversationKind = "chat" | "practice" | "teach" | "companion";

export interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  kind: ConversationKind;
  /** Which companion card (e.g. "shichimi", "pepper", "cumin") owns this conversation —
   * null for ordinary chat/practice threads that have no companion attached (spec 037). */
  companion_id: string | null;
  /** System-maintained trail-card name, "first station -> last station" (spec 041 §1) — null
   * until the conversation has any knowledge-node sighting. Display order is `auto_title ??
   * title`: once the user renames a conversation this column is cleared and stops updating,
   * so the rename always wins. */
  auto_title: string | null;
  /** The composer's 学习模式 toggle (spec 052), chat kind only: 0 = free chat (default),
   * 1 = guided learning. Other kinds ignore it — their prompts are fixed by kind. */
  study_mode: 0 | 1;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  /** Teaching mode that produced an assistant reply in a plain chat — "adaptive" | "direct" |
   * "guided" — NULL otherwise (spec 038). Kept as string here: core-db does not depend on
   * core-teaching. */
  teaching_mode: string | null;
  /** Tree parent (spec 040): the message this one replies to (user msg -> current leaf,
   * assistant msg -> its triggering user msg). NULL means "legacy-linear" — the implicit
   * parent is the previous row by created_at within the same conversation. */
  parent_id: string | null;
}

export interface LlmCallRow {
  id: string;
  conversation_id: string | null;
  /** Which feature made the call, e.g. "chat"; future plugins use their plugin id. */
  purpose: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  /** The slice of input_tokens the provider served from its prefix cache, when it reported
   * one. Null means the provider said nothing, so the whole prompt was billed as fresh —
   * which is distinct from a reported zero. */
  cached_input_tokens?: number | null;
  cost_micros: number;
  currency: Currency;
  created_at: string;
}
