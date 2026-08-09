/**
 * Purpose: SQL statements for the ranked ladder's single per-goal state row (spec 021) — the
 * internal rank scalar and fuel the learner's title was last derived from. No board tables:
 * the pseudo-people cast was removed with spec 021. No history by design.
 * Main exports: createGoalLaddersRepo factory.
 */
import type { GoalLadderStateRow, SqlClient } from "./types";

export function createGoalLaddersRepo(sql: SqlClient) {
  return {
    /** The goal's single state row, or null before the first view. */
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
           (goal_id, last_shown_rank, last_view_fuel, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(goal_id) DO UPDATE SET
           last_shown_rank = excluded.last_shown_rank,
           last_view_fuel = excluded.last_view_fuel,
           updated_at = excluded.updated_at`,
        [state.goal_id, state.last_shown_rank, state.last_view_fuel, state.updated_at],
      );
    },
  };
}
