/**
 * Purpose: SQL statements for the spec 036 research-task tables — run bookkeeping
 * (research_task_runs) and user-visible results (research_results, physically deletable).
 * Main exports: createResearchRepo factory (its row types live in researchTypes.ts).
 */
import type { ResearchResultRow, ResearchTaskRunRow } from "./researchTypes";
import type { SqlClient } from "./types";

export function createResearchRepo(sql: SqlClient) {
  return {
    /** Task ids that already ran — deleting a result never resurrects its task. */
    async listRunTaskIds(): Promise<string[]> {
      const rows = await sql.select<ResearchTaskRunRow>("SELECT * FROM research_task_runs");
      return rows.map((row) => row.task_id);
    },
    async recordRun(taskId: string, ranAt: string): Promise<void> {
      await sql.execute(
        "INSERT OR IGNORE INTO research_task_runs (task_id, ran_at) VALUES (?, ?)",
        [taskId, ranAt],
      );
    },
    async saveResult(row: ResearchResultRow): Promise<void> {
      await sql.execute(
        `INSERT OR REPLACE INTO research_results
         (id, task_id, institution, title, purpose, ethics_note, display_json, results_json, computed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.task_id,
          row.institution,
          row.title,
          row.purpose,
          row.ethics_note,
          row.display_json,
          row.results_json,
          row.computed_at,
        ],
      );
    },
    /** Newest first — the research panel's card order. */
    async listResults(): Promise<ResearchResultRow[]> {
      return sql.select<ResearchResultRow>(
        "SELECT * FROM research_results ORDER BY computed_at DESC, id DESC",
      );
    },
    /** Physical delete — the user's withdraw action (spec 036: keep or delete, never edit). */
    async deleteResult(id: string): Promise<void> {
      await sql.execute("DELETE FROM research_results WHERE id = ?", [id]);
    },
  };
}
