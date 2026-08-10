/**
 * Purpose: SQL statements for practice_attestations (spec 026) — the learner's own, never
 * AI-verified statement about a practice item, one row per item, overwritten in place.
 * Main exports: createPracticeRepo factory.
 */
import type { PracticeAttestationRow, SqlClient } from "./types";

export function createPracticeRepo(sql: SqlClient) {
  return {
    /** Every attestation the user has ever recorded. */
    async listAttestations(): Promise<PracticeAttestationRow[]> {
      return sql.select<PracticeAttestationRow>("SELECT * FROM practice_attestations");
    },
    /** Records or overwrites the user's self-report for one item — INSERT OR REPLACE keeps
     * the write idempotent as the user revises their own statement over time. */
    async upsertAttestation(row: PracticeAttestationRow): Promise<void> {
      await sql.execute(
        `INSERT OR REPLACE INTO practice_attestations (item_id, status, attested_at)
         VALUES (?, ?, ?)`,
        [row.item_id, row.status, row.attested_at],
      );
    },
  };
}
