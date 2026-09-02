/**
 * Purpose: SQL statements for the goals table (spec 012) — a learning goal's title and the
 * knowledge-node ids it maps to, most-recently-touched first.
 * Main exports: createGoalsRepo factory.
 */
import type { GoalRow } from "./knowledgeTypes";
import type { SqlClient } from "./types";

export function createGoalsRepo(sql: SqlClient) {
  return {
    async insert(row: GoalRow): Promise<void> {
      await sql.execute(
        "INSERT INTO goals (id, title, node_ids_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [row.id, row.title, row.node_ids_json, row.created_at, row.updated_at],
      );
    },
    async updateTitle(id: string, title: string, updatedAtIso: string): Promise<void> {
      await sql.execute("UPDATE goals SET title = ?, updated_at = ? WHERE id = ?", [
        title,
        updatedAtIso,
        id,
      ]);
    },
    async updateNodeIds(
      id: string,
      nodeIds: readonly string[],
      updatedAtIso: string,
    ): Promise<void> {
      await sql.execute("UPDATE goals SET node_ids_json = ?, updated_at = ? WHERE id = ?", [
        JSON.stringify(nodeIds),
        updatedAtIso,
        id,
      ]);
    },
    /** Every goal, most-recently-touched first. */
    async listAll(): Promise<GoalRow[]> {
      return sql.select<GoalRow>("SELECT * FROM goals ORDER BY updated_at DESC, id ASC");
    },
    async remove(id: string): Promise<void> {
      await sql.execute("DELETE FROM goals WHERE id = ?", [id]);
    },
  };
}
