/**
 * Purpose: SQL statements for the ranked-ladder tables (spec 018) — one goal's current
 * generation of reference figures (goal_ladders_v2), plus the permanent never-repeat backstop
 * of every `${name}|${era}` identity ever shown for that goal (ladder_shown_identities).
 * Main exports: createGoalLaddersRepo factory.
 */
import type { GoalLadderRow, LadderShownIdentityRow, SqlClient } from "./types";

export function createGoalLaddersRepo(sql: SqlClient) {
  return {
    /** Replaces a goal's whole current generation: deletes any existing rows for the goal,
     * then inserts the new ones. Callers pass a freshly-generated (or reused/unchanged) set —
     * this never partially updates a generation. */
    async replaceForGoal(goalId: string, rows: readonly GoalLadderRow[]): Promise<void> {
      await sql.execute("DELETE FROM goal_ladders_v2 WHERE goal_id = ?", [goalId]);
      for (const row of rows) {
        await sql.execute(
          `INSERT INTO goal_ladders_v2
             (id, goal_id, name, age, era, occupation, self_line, is_famous, rank, position,
              generation, user_rank_at_generation, chat_profile_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.goal_id,
            row.name,
            row.age,
            row.era,
            row.occupation,
            row.self_line,
            row.is_famous,
            row.rank,
            row.position,
            row.generation,
            row.user_rank_at_generation,
            row.chat_profile_json,
            row.created_at,
          ],
        );
      }
    },
    /** A goal's current generation, in stored display order (position asc) — never re-sorted
     * by the repo, so a reused ladder stays byte-stable. */
    async listForGoal(goalId: string): Promise<GoalLadderRow[]> {
      return sql.select<GoalLadderRow>(
        "SELECT * FROM goal_ladders_v2 WHERE goal_id = ? ORDER BY position ASC",
        [goalId],
      );
    },
    /** Every `${name}|${era}` identity ever shown for this goal — the forbidden list a new
     * generation must respect. Plain INSERT (never OR IGNORE): a genuine collision means an
     * identity that should have been forbidden slipped through, and that must raise, not
     * silently pass. */
    async recordShownIdentities(goalId: string, identities: readonly string[]): Promise<void> {
      for (const identity of identities) {
        await sql.execute("INSERT INTO ladder_shown_identities (goal_id, identity) VALUES (?, ?)", [
          goalId,
          identity,
        ]);
      }
    },
    async listShownIdentities(goalId: string): Promise<LadderShownIdentityRow[]> {
      return sql.select<LadderShownIdentityRow>(
        "SELECT * FROM ladder_shown_identities WHERE goal_id = ?",
        [goalId],
      );
    },
  };
}
