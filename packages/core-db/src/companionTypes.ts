/**
 * Purpose: row types for the companion cast data layer (spec 037) — the memory stream, the
 * proactive teach-back proposal log, and the per-conversation Reflect-Respond knowledge state.
 * Main exports: CompanionMemoryKind, CompanionMemoryRow, CompanionProposalStatus,
 * CompanionProposalRow, CompanionKnowledgeStateRow.
 */

/** 'observation' = one raw fact the companion noticed about the user during a round of chat.
 * 'reflection' = a higher-level insight the companion later distilled from a batch of
 * observations once their summed importance crossed the reflection threshold (Stanford
 * generative-agents memory stream). */
export type CompanionMemoryKind = "observation" | "reflection";

/** One entry of a companion's memory stream about the user (spec 037). importance is an
 * LLM-scored 1–10 poignancy rating; retrieval later combines it with recency decay and
 * token-overlap relevance. last_accessed_at starts equal to created_at and advances every
 * time the entry is retrieved into a prompt, feeding the recency factor. */
export interface CompanionMemoryRow {
  id: string;
  companion_id: string;
  kind: CompanionMemoryKind;
  content: string;
  importance: number;
  created_at: string;
  last_accessed_at: string;
}

/** 'pending' = gate passed, content not yet resolved by the user. 'accepted' resets a
 * companion's decline streak; 'declined' extends it (exponential backoff); 'expired' = the
 * user never responded — counted like a decline for backoff purposes by the caller, not by
 * this row's shape. */
export type CompanionProposalStatus = "pending" | "accepted" | "declined" | "expired";

/** One proactive teach-back invitation decision (spec 037, thunlp/ProactiveAgent-style gate).
 * node_id is the lowest-retention knowledge node the proposal targets — null is allowed
 * because the gate itself is pure/rule-based and may in principle propose without a node
 * (kept nullable to match the spec's table contract, not currently produced by the gate).
 * resolved_at is null while status is 'pending'. */
export interface CompanionProposalRow {
  id: string;
  companion_id: string;
  node_id: string | null;
  topic: string;
  status: CompanionProposalStatus;
  created_at: string;
  resolved_at: string | null;
}

/** The Reflect-Respond student model for one teach-back conversation (spec 037) — state_json
 * is the serialized knowledge state (expectation points, pending misconceptions, blanks); the
 * companion's replies are only ever allowed to draw on what is recorded here. One row per
 * conversation, replaced whole after every round (never appended). */
export interface CompanionKnowledgeStateRow {
  conversation_id: string;
  state_json: string;
  updated_at: string;
}
