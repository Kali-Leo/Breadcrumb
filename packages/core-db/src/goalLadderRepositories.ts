/**
 * Purpose: SQL statements for the ladder's per-goal assessment board (spec 022) — the three
 * currently-displayed titles and their cache expiry. Pure display cache: the ladder carries
 * no ranking mechanism, so nothing else is ever persisted.
 * Main exports: createGoalLaddersRepo factory.
 */
import type { GoalLadderBoardRow, SqlClient } from "./types";

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
  };
}
