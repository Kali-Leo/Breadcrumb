/**
 * Purpose: the conversation-delete cascade as one explicit, precomputed statement batch, plus
 * the declared list of every table that batch has to touch. Internal seam of
 * conversationsRepository.ts — deliberately not re-exported from the package entry.
 * Main exports: CONVERSATION_SCOPED_TABLES, buildConversationDeleteStatements.
 */
import type { SqlTransactionStatement } from "./types";

/**
 * Every table whose rows exist only because of one conversation, and which the delete batch
 * below therefore MUST handle. Kept as data so conversationDelete.test.ts can enumerate the
 * live schema (pragma foreign_key_list) and fail the moment a new conversation-scoped table
 * appears without a matching statement here — the same tripwire MERGE_REFERENCING_TABLES
 * gives the node merge, which was added only after that list silently drifted out of date and
 * broke every merge (2026-08-27).
 *
 * **Registering a new table here is not optional.** Any table added later that carries a
 * conversation_id, or that hangs off messages, has to be added to this list AND handled in
 * buildConversationDeleteStatements — otherwise deleting a chat leaves rows behind pointing
 * at a conversation that no longer exists.
 *
 * factcheck_claims, focus_nodes, term_marks and knowledge_edges declare no foreign key to
 * conversations or messages (they hang off factcheck_runs / focus_sessions, or carry a bare
 * target/message id), so the pragma cannot find them; they are listed by hand because leaving
 * them behind is the same bug, just silent.
 *
 * Deliberately absent: diglot_word_events carries a message_id for provenance but is the
 * learner's own vocabulary history, which outlives any one chat — the same reason
 * knowledge_nodes and llm_calls rows survive. It has no foreign key, so nothing dangles.
 */
export const CONVERSATION_SCOPED_TABLES: readonly string[] = [
  "factcheck_claims", // via factcheck_runs
  "factcheck_runs",
  "focus_nodes", // via focus_sessions
  "focus_sessions",
  "node_sightings",
  "interest_signals",
  "companion_knowledge_state",
  "term_marks", // target_kind='message', no declared FK
  "knowledge_edges", // source_message_id only: the edge itself survives, the link is cleared
  "llm_calls", // the row survives, only conversation_id is cleared
  "messages",
  "conversations",
];

/**
 * Children first, so a foreign key can never be left pointing at a row that is no longer
 * there. Ordered exactly as the batch must run and handed to executeTransaction as a whole.
 */
export function buildConversationDeleteStatements(id: string): SqlTransactionStatement[] {
  return [
    {
      sql: `DELETE FROM factcheck_claims WHERE run_id IN
                  (SELECT id FROM factcheck_runs WHERE conversation_id = ?)`,
      params: [id],
    },
    { sql: "DELETE FROM factcheck_runs WHERE conversation_id = ?", params: [id] },
    {
      sql: `DELETE FROM focus_nodes WHERE session_id IN
                  (SELECT id FROM focus_sessions WHERE conversation_id = ?)`,
      params: [id],
    },
    { sql: "DELETE FROM focus_sessions WHERE conversation_id = ?", params: [id] },
    { sql: "DELETE FROM node_sightings WHERE conversation_id = ?", params: [id] },
    { sql: "DELETE FROM interest_signals WHERE conversation_id = ?", params: [id] },
    { sql: "DELETE FROM companion_knowledge_state WHERE conversation_id = ?", params: [id] },
    {
      sql: `DELETE FROM term_marks WHERE target_kind = 'message' AND target_id IN
                  (SELECT id FROM messages WHERE conversation_id = ?)`,
      params: [id],
    },
    {
      sql: `UPDATE knowledge_edges SET source_message_id = NULL WHERE source_message_id IN
                  (SELECT id FROM messages WHERE conversation_id = ?)`,
      params: [id],
    },
    {
      sql: "UPDATE llm_calls SET conversation_id = NULL WHERE conversation_id = ?",
      params: [id],
    },
    { sql: "DELETE FROM messages WHERE conversation_id = ?", params: [id] },
    { sql: "DELETE FROM conversations WHERE id = ?", params: [id] },
  ];
}
