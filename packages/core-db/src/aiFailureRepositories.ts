/**
 * Purpose: SQL statements for the ai_failures table (spec 014) — a developer-visible record
 * of every silently-degraded AI pipeline failure, written best-effort from each store's catch.
 * Main exports: createAiFailuresRepo factory.
 */
import type { AiFailureRow } from "./featureTypes";
import type { SqlClient } from "./types";

export function createAiFailuresRepo(sql: SqlClient) {
  return {
    async record(row: AiFailureRow): Promise<void> {
      await sql.execute(
        "INSERT INTO ai_failures (id, purpose, message, created_at) VALUES (?, ?, ?, ?)",
        [row.id, row.purpose, row.message, row.created_at],
      );
    },
    /** Most-recent-first, capped at `limit` — the lab panel's "最近的静默失败" list. */
    async listRecent(limit: number): Promise<AiFailureRow[]> {
      return sql.select<AiFailureRow>(
        "SELECT * FROM ai_failures ORDER BY created_at DESC, id DESC LIMIT ?",
        [limit],
      );
    },
  };
}
