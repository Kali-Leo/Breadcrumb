/**
 * Purpose: SQL statements for standalone feature side-tables — memory-palace place-name
 * overrides, daily trail summaries, and fact-check runs/claims.
 * Main exports: mapPlaceNamesRepo, trailSummariesRepo, factcheckRepo factories.
 */
import type {
  FactcheckClaimRow,
  FactcheckRunRow,
  MapPlaceNameRow,
  TrailSummaryRow,
} from "./featureTypes";
import type { SqlClient } from "./types";

export function createMapPlaceNamesRepo(sql: SqlClient) {
  return {
    /** Every override, for building the map's display names. */
    async listAll(): Promise<MapPlaceNameRow[]> {
      return sql.select<MapPlaceNameRow>("SELECT * FROM map_place_names");
    },
    /** User renames always win; an AI suggestion never overwrites a user name. */
    async upsert(row: MapPlaceNameRow): Promise<void> {
      await sql.execute(
        `INSERT INTO map_place_names (node_id, custom_label, source, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(node_id) DO UPDATE SET
           custom_label = excluded.custom_label,
           source = excluded.source,
           updated_at = excluded.updated_at
         WHERE NOT (map_place_names.source = 'user' AND excluded.source = 'ai')`,
        [row.node_id, row.custom_label, row.source, row.updated_at],
      );
    },
    async removeOverride(nodeId: string): Promise<void> {
      await sql.execute("DELETE FROM map_place_names WHERE node_id = ?", [nodeId]);
    },
  };
}

export function createTrailSummariesRepo(sql: SqlClient) {
  return {
    async get(date: string): Promise<TrailSummaryRow | null> {
      const rows = await sql.select<TrailSummaryRow>(
        "SELECT * FROM trail_summaries WHERE date = ?",
        [date],
      );
      return rows[0] ?? null;
    },
    /** Every summary dated on or after `fromDate` (a "YYYY-MM-DD" key), newest first — the
     * card's "last few days" list. */
    async listSince(fromDate: string): Promise<TrailSummaryRow[]> {
      return sql.select<TrailSummaryRow>(
        "SELECT * FROM trail_summaries WHERE date >= ? ORDER BY date DESC",
        [fromDate],
      );
    },
    async set(row: TrailSummaryRow): Promise<void> {
      await sql.execute(
        `INSERT INTO trail_summaries (date, content, created_at) VALUES (?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET content = excluded.content, created_at = excluded.created_at`,
        [row.date, row.content, row.created_at],
      );
    },
  };
}

export function createFactcheckRepo(sql: SqlClient) {
  return {
    /** One transaction for the run row plus all its claims — a crash never leaves a run
     * without its claims (or orphaned claims). */
    async recordRun(run: FactcheckRunRow, claims: readonly FactcheckClaimRow[]): Promise<void> {
      await sql.executeTransaction([
        {
          sql: "INSERT INTO factcheck_runs (id, message_id, conversation_id, created_at) VALUES (?, ?, ?, ?)",
          params: [run.id, run.message_id, run.conversation_id, run.created_at],
        },
        ...claims.map((claim) => ({
          sql: `INSERT INTO factcheck_claims
             (id, run_id, claim_text, relationship, reasoning, evidence_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          params: [
            claim.id,
            claim.run_id,
            claim.claim_text,
            claim.relationship,
            claim.reasoning,
            claim.evidence_json,
            claim.created_at,
          ],
        })),
      ]);
    },
    /** All runs of one conversation, oldest first — the newest run per message wins in UI. */
    async listRunsByConversation(conversationId: string): Promise<FactcheckRunRow[]> {
      return sql.select<FactcheckRunRow>(
        "SELECT * FROM factcheck_runs WHERE conversation_id = ? ORDER BY created_at ASC, id ASC",
        [conversationId],
      );
    },
    async listClaimsByRun(runId: string): Promise<FactcheckClaimRow[]> {
      return sql.select<FactcheckClaimRow>(
        "SELECT * FROM factcheck_claims WHERE run_id = ? ORDER BY created_at ASC, id ASC",
        [runId],
      );
    },
    /** Every claim of a set of runs in one round trip. Loading a conversation's fact-check
     * layer used to issue one query per run; the caller groups the rows by `run_id`. */
    async listClaimsByRuns(runIds: readonly string[]): Promise<FactcheckClaimRow[]> {
      const rows: FactcheckClaimRow[] = [];
      // Chunked to stay well under SQLite's bound-parameter ceiling however many runs a
      // long-lived conversation accumulates.
      for (let start = 0; start < runIds.length; start += RUN_ID_CHUNK_SIZE) {
        const chunk = runIds.slice(start, start + RUN_ID_CHUNK_SIZE);
        const placeholders = chunk.map(() => "?").join(", ");
        rows.push(
          ...(await sql.select<FactcheckClaimRow>(
            `SELECT * FROM factcheck_claims WHERE run_id IN (${placeholders})
             ORDER BY created_at ASC, id ASC`,
            chunk,
          )),
        );
      }
      return rows;
    },
  };
}

/** Bound parameters per batched claim query. */
const RUN_ID_CHUNK_SIZE = 400;
