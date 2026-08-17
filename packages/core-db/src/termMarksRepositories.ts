/**
 * Purpose: SQL statements for term_marks (spec 043 §5) — one cached term-marking verdict per
 * (target_kind, target_id), so a message or focus-node answer is ever LLM-marked at most once.
 * Main exports: createTermMarksRepo.
 */
import type { SqlClient, TermMarkRow, TermMarkTargetKind } from "./types";

export function createTermMarksRepo(sql: SqlClient) {
  return {
    /** Looks up an already-cached verdict for one target — a hit means the caller must not
     * call the LLM again (spec 043 §5's anti-double-billing rule). */
    async getByTarget(
      targetKind: TermMarkTargetKind,
      targetId: string,
    ): Promise<TermMarkRow | null> {
      const rows = await sql.select<TermMarkRow>(
        "SELECT * FROM term_marks WHERE target_kind = ? AND target_id = ?",
        [targetKind, targetId],
      );
      return rows[0] ?? null;
    },
    /** First verdict wins: a concurrent duplicate insert for the same target is silently
     * dropped instead of surfacing a UNIQUE-index error to the caller. */
    async insert(row: TermMarkRow): Promise<void> {
      await sql.execute(
        "INSERT INTO term_marks (id, target_kind, target_id, terms_json, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(target_kind, target_id) DO NOTHING",
        [row.id, row.target_kind, row.target_id, row.terms_json, row.created_at],
      );
    },
  };
}
