/**
 * Purpose: SQL statements for a focus (explain-word) session's two tables (spec 042 §1) — the
 * session shell and its subway-map stations.
 * Main exports: createFocusSessionsRepo, createFocusNodesRepo factories.
 */
import type { FocusNodeRow, FocusSessionRow, SqlClient } from "./types";

export function createFocusSessionsRepo(sql: SqlClient) {
  return {
    async insert(row: FocusSessionRow): Promise<void> {
      await sql.execute(
        `INSERT INTO focus_sessions
           (id, conversation_id, entry_message_id, root_label, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.conversation_id,
          row.entry_message_id,
          row.root_label,
          row.created_at,
          row.updated_at,
        ],
      );
    },
    /** Fills in the exit-time record message id (spec 042 §5) — NULL until the session ends. */
    async setEntryMessage(id: string, messageId: string, updatedAtIso: string): Promise<void> {
      await sql.execute(
        "UPDATE focus_sessions SET entry_message_id = ?, updated_at = ? WHERE id = ?",
        [messageId, updatedAtIso, id],
      );
    },
    async getById(id: string): Promise<FocusSessionRow | null> {
      const rows = await sql.select<FocusSessionRow>("SELECT * FROM focus_sessions WHERE id = ?", [
        id,
      ]);
      return rows[0] ?? null;
    },
    /** Looks a session up by its exit-time record message (spec 042 §5 "点击条目 → 恢复整个专注会话"). */
    async getByEntryMessage(messageId: string): Promise<FocusSessionRow | null> {
      const rows = await sql.select<FocusSessionRow>(
        "SELECT * FROM focus_sessions WHERE entry_message_id = ?",
        [messageId],
      );
      return rows[0] ?? null;
    },
    async listByConversation(conversationId: string): Promise<FocusSessionRow[]> {
      return sql.select<FocusSessionRow>(
        "SELECT * FROM focus_sessions WHERE conversation_id = ? ORDER BY created_at ASC, id ASC",
        [conversationId],
      );
    },
  };
}

export function createFocusNodesRepo(sql: SqlClient) {
  return {
    async insert(row: FocusNodeRow): Promise<void> {
      await sql.execute(
        `INSERT INTO focus_nodes
           (id, session_id, parent_id, kind, label, question_text, answer_text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.session_id,
          row.parent_id,
          row.kind,
          row.label,
          row.question_text,
          row.answer_text,
          row.created_at,
        ],
      );
    },
    /** Every station of one session, oldest first — the order the subway map layout and the
     * exit record's preorder walk both build from. */
    async listBySession(sessionId: string): Promise<FocusNodeRow[]> {
      return sql.select<FocusNodeRow>(
        "SELECT * FROM focus_nodes WHERE session_id = ? ORDER BY created_at ASC, id ASC",
        [sessionId],
      );
    },
    /** Not used on the normal insert-only path; kept for a future edit/retry affordance. */
    async updateAnswer(id: string, answerText: string): Promise<void> {
      await sql.execute("UPDATE focus_nodes SET answer_text = ? WHERE id = ?", [answerText, id]);
    },
  };
}
