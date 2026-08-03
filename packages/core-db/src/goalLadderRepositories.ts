/**
 * Purpose: SQL statements for the pseudo-ranked ladder tables (spec 016) — one goal's current
 * generation of 5 reference figures, and the permanent never-repeat backstop of every
 * figure_desc ever shown for that goal.
 * Main exports: createGoalLaddersRepo factory.
 */
import type { GoalLadderRow, LadderShownDescriptionRow, SqlClient } from "./types";

export function createGoalLaddersRepo(sql: SqlClient) {
  return {
    /** Replaces a goal's whole current generation: deletes any existing rows for the goal,
     * then inserts the new ones. Callers pass a freshly-generated (or reused/unchanged) set —
     * this never partially updates a generation. */
    async replaceForGoal(goalId: string, rows: readonly GoalLadderRow[]): Promise<void> {
      await sql.execute("DELETE FROM goal_ladders WHERE goal_id = ?", [goalId]);
      for (const row of rows) {
        await sql.execute(
          `INSERT INTO goal_ladders
             (id, goal_id, figure_desc, figure_note, milestone, position, generation, user_milestone_at_generation, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.goal_id,
            row.figure_desc,
            row.figure_note,
            row.milestone,
            row.position,
            row.generation,
            row.user_milestone_at_generation,
            row.created_at,
          ],
        );
      }
    },
    /** A goal's current generation, in stored display order (position asc) — never re-sorted
     * by the repo, so a reused ladder stays byte-stable. */
    async listForGoal(goalId: string): Promise<GoalLadderRow[]> {
      return sql.select<GoalLadderRow>(
        "SELECT * FROM goal_ladders WHERE goal_id = ? ORDER BY position ASC",
        [goalId],
      );
    },
    /** Every figure_desc ever shown for this goal — the forbidden list a new generation must
     * respect. Plain INSERT (never OR IGNORE): a genuine collision means a description that
     * should have been forbidden slipped through, and that must raise, not silently pass. */
    async recordShownDescriptions(goalId: string, figureDescs: readonly string[]): Promise<void> {
      for (const figureDesc of figureDescs) {
        await sql.execute(
          "INSERT INTO ladder_shown_descriptions (goal_id, figure_desc) VALUES (?, ?)",
          [goalId, figureDesc],
        );
      }
    },
    async listShownDescriptions(goalId: string): Promise<LadderShownDescriptionRow[]> {
      return sql.select<LadderShownDescriptionRow>(
        "SELECT * FROM ladder_shown_descriptions WHERE goal_id = ?",
        [goalId],
      );
    },
  };
}
