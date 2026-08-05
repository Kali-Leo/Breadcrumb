/**
 * Purpose: SQL statements for the ranked-ladder tables (spec 020) — one goal's current board
 * of deceased famous figures (goal_ladder_figures, replaced whole on refresh) plus the single
 * per-goal state row (goal_ladder_state). No history tables by design.
 * Main exports: createGoalLaddersRepo factory.
 */
import type { GoalLadderFigureRow, GoalLadderStateRow, SqlClient } from "./types";

export function createGoalLaddersRepo(sql: SqlClient) {
  return {
    /** Replaces a goal's whole current board: deletes any existing figures for the goal, then
     * inserts the new cast — this never partially updates a board. */
    async replaceFigures(goalId: string, rows: readonly GoalLadderFigureRow[]): Promise<void> {
      await sql.execute("DELETE FROM goal_ladder_figures WHERE goal_id = ?", [goalId]);
      for (const row of rows) {
        await sql.execute(
          `INSERT INTO goal_ladder_figures
             (id, goal_id, name, age, era, occupation, self_line, rank, position, generation,
              chat_profile_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.goal_id,
            row.name,
            row.age,
            row.era,
            row.occupation,
            row.self_line,
            row.rank,
            row.position,
            row.generation,
            row.chat_profile_json,
            row.created_at,
          ],
        );
      }
    },
    /** A goal's current board in stored display order (position asc) — never re-sorted by the
     * repo, so a board stays byte-stable for its whole lifetime. */
    async listFigures(goalId: string): Promise<GoalLadderFigureRow[]> {
      return sql.select<GoalLadderFigureRow>(
        "SELECT * FROM goal_ladder_figures WHERE goal_id = ? ORDER BY position ASC",
        [goalId],
      );
    },
    /** The goal's single state row, or null before the first generation. */
    async getState(goalId: string): Promise<GoalLadderStateRow | null> {
      const rows = await sql.select<GoalLadderStateRow>(
        "SELECT * FROM goal_ladder_state WHERE goal_id = ?",
        [goalId],
      );
      return rows[0] ?? null;
    },
    /** Upserts the whole state row — the caller always writes a complete picture; partial
     * column updates are deliberately not offered (one writer, no merge semantics needed). */
    async upsertState(state: GoalLadderStateRow): Promise<void> {
      await sql.execute(
        `INSERT INTO goal_ladder_state
           (goal_id, last_shown_rank, last_view_fuel, next_refresh_at, generation, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(goal_id) DO UPDATE SET
           last_shown_rank = excluded.last_shown_rank,
           last_view_fuel = excluded.last_view_fuel,
           next_refresh_at = excluded.next_refresh_at,
           generation = excluded.generation,
           updated_at = excluded.updated_at`,
        [
          state.goal_id,
          state.last_shown_rank,
          state.last_view_fuel,
          state.next_refresh_at,
          state.generation,
          state.updated_at,
        ],
      );
    },
  };
}
