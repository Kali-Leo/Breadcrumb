/**
 * Purpose: SQL statements for a focus (explain-word) session's two tables (spec 042 §1) — the
 * session shell and its subway-map stations, including the LLM short-name overwrite (spec 042
 * §4) that keeps long labels legible on the map, and the outright delete a zero-substance
 * session gets on exit (Leo 2026-08-14 revision to spec 042 §5).
 * Main exports: createFocusSessionsRepo, createFocusNodesRepo factories.
 */
import type { FocusNodeRow, FocusSessionRow, SqlClient } from "./types";

export function createFocusSessionsRepo(sql: SqlClient) {
  return {
    async insert(row: FocusSessionRow): Promise<void> {
      await sql.execute(
        `INSERT INTO focus_sessions
           (id, conversation_id, entry_message_id, root_label, created_at, updated_at,
            source_message_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.conversation_id,
          row.entry_message_id,
          row.root_label,
          row.created_at,
          row.updated_at,
          row.source_message_id,
        ],
      );
    },
    /** Legacy (pre-2026-08-14): fills in the exit-time record message id. No longer called on
     * the normal exit path — kept only so a pre-0035 session's old record card can still be
     * looked up (getByEntryMessage). */
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
    /** Looks a legacy session up by its exit-time record message (spec 042 §5, pre-2026-08-14
     * sessions only — no session created after 0035 ever has one). */
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
    /** Deletes a session shell outright — the zero-substance-session cleanup on exit (Leo
     * 2026-08-14 revision to spec 042 §5). Caller removes its nodes first (FK-shaped ordering,
     * no real FK/cascade in this schema). */
    async remove(id: string): Promise<void> {
      await sql.execute("DELETE FROM focus_sessions WHERE id = ?", [id]);
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
    /** Overwrites a station's label with an LLM-summarized short name once one lands (spec 042
     * §4 legibility fix) — fire-and-forget from the desktop store, so the map redraws with the
     * shorter name; nothing else about the row changes. */
    async updateLabel(id: string, label: string): Promise<void> {
      await sql.execute("UPDATE focus_nodes SET label = ? WHERE id = ?", [label, id]);
    },
    /** Deletes every station of one session — paired with focusSessions.remove for the
     * zero-substance-session cleanup on exit (Leo 2026-08-14 revision to spec 042 §5). */
    async removeBySession(sessionId: string): Promise<void> {
      await sql.execute("DELETE FROM focus_nodes WHERE session_id = ?", [sessionId]);
    },
  };
}
