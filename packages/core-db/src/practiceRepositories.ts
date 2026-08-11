/**
 * Purpose: SQL statements for practice_scores (spec 029) — the learner's own, never
 * AI-verified 0–10 score on a pure experience leaf, one row per item, overwritten in place.
 * Main exports: createPracticeRepo factory.
 */
import type { PracticeScoreRow, SqlClient } from "./types";

export function createPracticeRepo(sql: SqlClient) {
  return {
    /** Every score the user has ever recorded. */
    async listScores(): Promise<PracticeScoreRow[]> {
      return sql.select<PracticeScoreRow>("SELECT * FROM practice_scores");
    },
    /** Records or overwrites the user's score for one item — INSERT OR REPLACE keeps the
     * write idempotent as the user revises their own statement over time. */
    async upsertScore(row: PracticeScoreRow): Promise<void> {
      await sql.execute(
        `INSERT OR REPLACE INTO practice_scores (item_id, score, scored_at)
         VALUES (?, ?, ?)`,
        [row.item_id, row.score, row.scored_at],
      );
    },
  };
}
