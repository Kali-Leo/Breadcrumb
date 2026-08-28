/**
 * Purpose: SQL statements for the companion cast tables (spec 037) — the per-companion memory
 * stream, the proactive teach-back proposal log, and per-conversation knowledge state.
 * Main exports: createCompanionMemoriesRepo, createCompanionProposalsRepo,
 * createCompanionKnowledgeStateRepo factories.
 */
import type {
  CompanionKnowledgeStateRow,
  CompanionMemoryRow,
  CompanionProposalRow,
  CompanionProposalStatus,
} from "./companionTypes";
import type { SqlClient } from "./types";

export function createCompanionMemoriesRepo(sql: SqlClient) {
  return {
    async insert(row: CompanionMemoryRow): Promise<void> {
      await sql.execute(
        `INSERT INTO companion_memories
           (id, companion_id, kind, content, importance, created_at, last_accessed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.companion_id,
          row.kind,
          row.content,
          row.importance,
          row.created_at,
          row.last_accessed_at,
        ],
      );
    },
    /** The full memory stream of one companion, oldest first — retrieval scoring (recency ×
     * importance × relevance) reads the whole stream and ranks it itself. */
    async listByCompanion(companionId: string): Promise<CompanionMemoryRow[]> {
      return sql.select<CompanionMemoryRow>(
        "SELECT * FROM companion_memories WHERE companion_id = ? ORDER BY created_at ASC, id ASC",
        [companionId],
      );
    },
    /** Advances last_accessed_at for every retrieved memory in one round — the recency factor
     * for the NEXT retrieval is measured from here, not from created_at. */
    async touchLastAccessed(ids: readonly string[], isoNow: string): Promise<void> {
      if (ids.length === 0) return;
      const placeholders = ids.map(() => "?").join(", ");
      await sql.execute(
        `UPDATE companion_memories SET last_accessed_at = ? WHERE id IN (${placeholders})`,
        [isoNow, ...ids],
      );
    },
    /** Sum of OBSERVATION importance recorded since the companion's last reflection — the
     * reflection trigger fires once this crosses a threshold (Stanford generative agents).
     * Reflections are excluded on purpose: the window starts at the last reflection's own
     * created_at, so counting reflections would feed their own importance (a reflection round
     * writes several, each scored high) straight back into the next window and every single
     * observation afterwards would re-trip the threshold — reflection every round, on one
     * observation's worth of material. */
    async sumImportanceSince(companionId: string, isoSince: string): Promise<number> {
      const rows = await sql.select<{ total: number | null }>(
        `SELECT SUM(importance) AS total FROM companion_memories
         WHERE companion_id = ? AND kind = 'observation' AND created_at >= ?`,
        [companionId, isoSince],
      );
      return rows[0]?.total ?? 0;
    },
  };
}

export function createCompanionProposalsRepo(sql: SqlClient) {
  return {
    async insert(row: CompanionProposalRow): Promise<void> {
      await sql.execute(
        `INSERT INTO companion_proposals
           (id, companion_id, node_id, topic, kind, status, created_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.companion_id,
          row.node_id,
          row.topic,
          row.kind,
          row.status,
          row.created_at,
          row.resolved_at,
        ],
      );
    },
    /** The single most recent proposal — scoped to one companion, or across every companion
     * when omitted (the gate's global daily-cap check reads the unscoped form). */
    async latestByStatus(companionId?: string): Promise<CompanionProposalRow | null> {
      const rows = companionId
        ? await sql.select<CompanionProposalRow>(
            "SELECT * FROM companion_proposals WHERE companion_id = ? ORDER BY created_at DESC LIMIT 1",
            [companionId],
          )
        : await sql.select<CompanionProposalRow>(
            "SELECT * FROM companion_proposals ORDER BY created_at DESC LIMIT 1",
          );
      return rows[0] ?? null;
    },
    /** Every proposal created since the given instant, newest first — the gate's daily-cap and
     * quiet-hours checks read this window directly. */
    async listRecent(sinceIso: string): Promise<CompanionProposalRow[]> {
      return sql.select<CompanionProposalRow>(
        "SELECT * FROM companion_proposals WHERE created_at >= ? ORDER BY created_at DESC",
        [sinceIso],
      );
    },
    async resolve(
      id: string,
      status: CompanionProposalStatus,
      resolvedAtIso: string,
    ): Promise<void> {
      await sql.execute("UPDATE companion_proposals SET status = ?, resolved_at = ? WHERE id = ?", [
        status,
        resolvedAtIso,
        id,
      ]);
    },
    /** Count of proposals created since the given instant, across every companion — the
     * gate's global "at most one a day" cap (spec 037). */
    async countCreatedSince(sinceIso: string): Promise<number> {
      const rows = await sql.select<{ total: number }>(
        "SELECT COUNT(*) AS total FROM companion_proposals WHERE created_at >= ?",
        [sinceIso],
      );
      return rows[0]?.total ?? 0;
    },
    /** How many of the companion's most recent proposals were declined in a row, stopping at
     * the first non-declined one — feeds the exponential backoff (1→2→4→8 days). Resolved via
     * a full ordered fetch rather than SQL, since SQLite has no clean "streak" primitive. */
    async consecutiveDeclineCount(companionId: string): Promise<number> {
      const rows = await sql.select<CompanionProposalRow>(
        "SELECT * FROM companion_proposals WHERE companion_id = ? ORDER BY created_at DESC",
        [companionId],
      );
      let streak = 0;
      for (const row of rows) {
        if (row.status !== "declined") break;
        streak += 1;
      }
      return streak;
    },
  };
}

export function createCompanionKnowledgeStateRepo(sql: SqlClient) {
  return {
    async upsert(conversationId: string, stateJson: string, updatedAtIso: string): Promise<void> {
      await sql.execute(
        `INSERT INTO companion_knowledge_state (conversation_id, state_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(conversation_id) DO UPDATE SET
           state_json = excluded.state_json, updated_at = excluded.updated_at`,
        [conversationId, stateJson, updatedAtIso],
      );
    },
    async getByConversation(conversationId: string): Promise<CompanionKnowledgeStateRow | null> {
      const rows = await sql.select<CompanionKnowledgeStateRow>(
        "SELECT * FROM companion_knowledge_state WHERE conversation_id = ? LIMIT 1",
        [conversationId],
      );
      return rows[0] ?? null;
    },
  };
}
