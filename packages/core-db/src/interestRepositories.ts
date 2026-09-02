/**
 * Purpose: SQL statements for the two independent mastery/interest evidence tables (spec
 * 011) — LLM-observed interest signals and user self-report mastery claims.
 * Main exports: createInterestSignalsRepo, createMasteryClaimsRepo factories.
 */
import type { InterestSignalRow, MasteryClaimRow } from "./knowledgeTypes";
import type { SqlClient } from "./types";

export function createInterestSignalsRepo(sql: SqlClient) {
  return {
    async insert(row: InterestSignalRow): Promise<void> {
      await sql.execute(
        `INSERT INTO interest_signals
           (id, node_id, conversation_id, curiosity, confusion, boredom, confidence, styles_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.node_id,
          row.conversation_id,
          row.curiosity,
          row.confusion,
          row.boredom,
          row.confidence,
          row.styles_json,
          row.created_at,
        ],
      );
    },
    /** Every signal ever recorded — raw material for aggregateInterest/aggregateStyles. */
    async listAll(): Promise<InterestSignalRow[]> {
      return sql.select<InterestSignalRow>(
        "SELECT * FROM interest_signals ORDER BY created_at ASC, id ASC",
      );
    },
  };
}

export function createMasteryClaimsRepo(sql: SqlClient) {
  return {
    async insert(row: MasteryClaimRow): Promise<void> {
      await sql.execute(
        "INSERT INTO mastery_claims (id, node_id, level, source, created_at) VALUES (?, ?, ?, ?, ?)",
        [row.id, row.node_id, row.level, row.source, row.created_at],
      );
    },
    /** Every claim ever recorded — raw material for computeMastery. */
    async listAll(): Promise<MasteryClaimRow[]> {
      return sql.select<MasteryClaimRow>(
        "SELECT * FROM mastery_claims ORDER BY created_at ASC, id ASC",
      );
    },
  };
}
