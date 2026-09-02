/**
 * Purpose: SQL statements for the conversations table — creating, listing, renaming and
 * deleting the learner's chat threads. The delete cascade's statement batch and its declared
 * table list live in conversationDeleteStatements.ts.
 * Main exports: createConversationsRepo factory.
 */

import type { ConversationKind, ConversationRow } from "./chatTypes";
import { buildConversationDeleteStatements } from "./conversationDeleteStatements";
import type { SqlClient } from "./types";

export function createConversationsRepo(sql: SqlClient) {
  return {
    /** companion_id is optional here (defaults to null) so every caller predating spec 037's
     * companion cast keeps typechecking without touching every call site. auto_title is never
     * set at creation (spec 041 §1) — it starts NULL and is filled in once the trail has
     * stations, via setAutoTitle. */
    async create(
      row: Omit<ConversationRow, "companion_id" | "auto_title" | "study_mode"> & {
        companion_id?: string | null;
        study_mode?: 0 | 1;
      },
    ): Promise<void> {
      await sql.execute(
        "INSERT INTO conversations (id, title, created_at, updated_at, kind, companion_id, study_mode) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          row.id,
          row.title,
          row.created_at,
          row.updated_at,
          row.kind,
          row.companion_id ?? null,
          row.study_mode ?? 0,
        ],
      );
    },
    /** Every conversation regardless of kind, newest first. */
    async listRecentFirst(): Promise<ConversationRow[]> {
      return sql.select<ConversationRow>("SELECT * FROM conversations ORDER BY updated_at DESC");
    },
    /** One conversation by id, or null — the chat flow branches on kind (spec 034). */
    async getById(id: string): Promise<ConversationRow | null> {
      const rows = await sql.select<ConversationRow>(
        "SELECT * FROM conversations WHERE id = ? LIMIT 1",
        [id],
      );
      return rows[0] ?? null;
    },
    /** One kind only, newest first — the sidebar uses this with 'chat' so practice discussions
     * (spec 026) stay out of the standing conversation list while remaining fully saved. */
    async listByKind(kind: ConversationKind): Promise<ConversationRow[]> {
      return sql.select<ConversationRow>(
        "SELECT * FROM conversations WHERE kind = ? ORDER BY updated_at DESC",
        [kind],
      );
    },
    /** The most recently updated conversation of one kind belonging to one companion card
     * (spec 037) — reopening a companion from the sidebar continues this thread instead of
     * starting a new one. */
    async findLatestByCompanion(
      companionId: string,
      kind: ConversationKind,
    ): Promise<ConversationRow | null> {
      const rows = await sql.select<ConversationRow>(
        `SELECT * FROM conversations WHERE companion_id = ? AND kind = ?
         ORDER BY updated_at DESC LIMIT 1`,
        [companionId, kind],
      );
      return rows[0] ?? null;
    },
    async touch(id: string, updatedAtIso: string): Promise<void> {
      await sql.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", [updatedAtIso, id]);
    },
    /** A user rename always wins and freezes auto-naming (spec 041 §1): title changes and
     * auto_title is cleared in the same statement, so the trail-card display (`auto_title ??
     * title`) falls back to this title and future auto-naming passes leave it alone. */
    async rename(id: string, title: string): Promise<void> {
      await sql.execute("UPDATE conversations SET title = ?, auto_title = NULL WHERE id = ?", [
        title,
        id,
      ]);
    },
    /** Recomputed after every new station on the trail (spec 041 §1) — only ever touches
     * auto_title, never updated_at, so a fresh name never reshuffles the sidebar's order. */
    async setAutoTitle(id: string, autoTitle: string | null): Promise<void> {
      await sql.execute("UPDATE conversations SET auto_title = ? WHERE id = ?", [autoTitle, id]);
    },
    /**
     * Deletes a conversation and everything that only existed because of it: its messages and
     * the footprints they left. What survives is deliberate:
     *  - **Knowledge nodes stay.** They belong to the learner, not to one chat; a concept met
     *    in three conversations must not vanish because one of them was tidied away.
     *  - **Spending records stay**, with their conversation link cleared. Deleting a chat is
     *    housekeeping, not a way to make money already spent disappear from the bill.
     * Ordered children-first and run in one transaction, so a foreign key can never be left
     * pointing at a row that is no longer there.
     */
    async remove(id: string): Promise<void> {
      await sql.executeTransaction(buildConversationDeleteStatements(id));
    },
    /** Flips the 学习模式 toggle (spec 052); never touches updated_at, so toggling alone
     * does not reshuffle the sidebar. */
    async setStudyMode(id: string, studyMode: 0 | 1): Promise<void> {
      await sql.execute("UPDATE conversations SET study_mode = ? WHERE id = ?", [studyMode, id]);
    },
  };
}
