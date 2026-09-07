/**
 * Purpose: row types for the focus (explain-word) sessions — a session, the stations of its
 * subway map — and for the cached term-marking verdicts that decide which words in an answer
 * become doors.
 * Main exports: FocusSessionRow, FocusNodeKind, FocusNodeRow, TermMarkTargetKind, TermMarkRow.
 */

/** One full-screen focus (explain-word) session — a subway-map-v2 exploration rooted at a
 * word picked from an ordinary reply. entry_message_id is a legacy column: sessions used to
 * fill it in on exit with the id of the assistant message their exit record was appended as;
 * that no longer happens, so it stays NULL on every session created from 0035 onward.
 * source_message_id (0035) replaces it — the reply the session was born from, set at creation
 * time and never rewritten; it anchors the session's in-place badge and is NULL for sessions
 * predating 0035. */
export interface FocusSessionRow {
  id: string;
  conversation_id: string;
  entry_message_id: string | null;
  root_label: string;
  created_at: string;
  updated_at: string;
  source_message_id: string | null;
}

/** 'word' = solid-line child station opened by picking a word inside the parent's answer;
 * 'question' = dashed diagonal station opened by the free-text prompt box. */
export type FocusNodeKind = "word" | "question";

/** One station of a focus session's subway map. parent_id NULL = the session's
 * root station. question_text is set only for kind='question'; answer_text is always the
 * node's full reply and is what descendant nodes quote as prompt context. kind is
 * validated in TypeScript, not a DB CHECK — same convention as conversations.kind. */
export interface FocusNodeRow {
  id: string;
  session_id: string;
  parent_id: string | null;
  kind: FocusNodeKind;
  label: string;
  question_text: string | null;
  answer_text: string;
  created_at: string;
}

/** Which kind of answer a term-marking pass was run against. Validated in
 * TypeScript, not a DB CHECK — same convention as conversations.kind. */
export type TermMarkTargetKind = "message" | "focus_node";

/** One cached term-marking verdict, keyed uniquely by (target_kind, target_id) — a second
 * lookup for the same target reuses this row instead of paying for another LLM call.
 * terms_json is a JSON array of the ordered (obstruction-descending), already-clipped term
 * strings that shipped as doors. */
export interface TermMarkRow {
  id: string;
  target_kind: TermMarkTargetKind;
  target_id: string;
  terms_json: string;
  created_at: string;
}
