/**
 * Purpose: SQL statements for the ladder's per-goal display cache (spec 022/032) — the three
 * currently-displayed titles with their expiry, plus the goal's ten-rung title ladder
 * composed once and never rerolled. Pure display data: no ranking mechanism anywhere.
 * Main exports: createGoalLaddersRepo factory.
 */
import type { GoalLadderBoardRow, GoalTitleLadderRow, SqlClient } from "./types";

export function createGoalLaddersRepo(sql: SqlClient) {
  return {
    /** The goal's current board, or null before the first assessment. */
    async getBoard(goalId: string): Promise<GoalLadderBoardRow | null> {
      const rows = await sql.select<GoalLadderBoardRow>(
        "SELECT * FROM goal_ladder_board WHERE goal_id = ?",
        [goalId],
      );
      return rows[0] ?? null;
    },
    /** Upserts the whole board row — the caller always writes a complete picture; partial
     * column updates are deliberately not offered (one writer, no merge semantics needed). */
    async upsertBoard(board: GoalLadderBoardRow): Promise<void> {
      await sql.execute(
        `INSERT INTO goal_ladder_board
           (goal_id, above_title, self_title, below_title, next_refresh_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(goal_id) DO UPDATE SET
           above_title = excluded.above_title,
           self_title = excluded.self_title,
           below_title = excluded.below_title,
           next_refresh_at = excluded.next_refresh_at,
           updated_at = excluded.updated_at`,
        [
          board.goal_id,
          board.above_title,
          board.self_title,
          board.below_title,
          board.next_refresh_at,
          board.updated_at,
        ],
      );
    },
    /** The goal's composed title ladder, or null before its one-time composition. */
    async getTitleLadder(goalId: string): Promise<GoalTitleLadderRow | null> {
      const rows = await sql.select<GoalTitleLadderRow>(
        "SELECT * FROM goal_title_ladder WHERE goal_id = ?",
        [goalId],
      );
      return rows[0] ?? null;
    },
    /** Writes the composed ladder — INSERT only in spirit (no reroll), REPLACE kept so a
     * goal whose title was edited can be recomposed by explicitly deleting first. */
    async upsertTitleLadder(row: GoalTitleLadderRow): Promise<void> {
      await sql.execute(
        `INSERT OR REPLACE INTO goal_title_ladder (goal_id, identity, rungs_json, created_at)
         VALUES (?, ?, ?, ?)`,
        [row.goal_id, row.identity, row.rungs_json, row.created_at],
      );
    },
  };
}
