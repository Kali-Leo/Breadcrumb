/**
 * Purpose: SQL statements for the canonical-concept crosswalk (spec 025) — a concept-space
 * shared by every comparison profile, plus the anchors judging user knowledge nodes against it.
 * Main exports: createCanonicalRepo factory.
 */
import type { CanonicalConceptRow, NodeConceptAnchorRow, SqlClient } from "./types";

export function createCanonicalRepo(sql: SqlClient) {
  return {
    /** Persists concepts once and for all — INSERT OR REPLACE so re-importing a concept (e.g.
     * a refreshed source_ref) overwrites rather than duplicates. Additive-idempotent: never
     * deletes existing concepts, since node_concept_anchors and comparison_profile_items
     * reference them by id. */
    async upsertConcepts(rows: readonly CanonicalConceptRow[]): Promise<void> {
      for (const row of rows) {
        await sql.execute(
          `INSERT OR REPLACE INTO canonical_concepts (id, label, aliases_json, source_ref, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [row.id, row.label, row.aliases_json, row.source_ref, row.created_at],
        );
      }
    },
    /** All concepts, ordered by id. */
    async listConcepts(): Promise<CanonicalConceptRow[]> {
      return sql.select<CanonicalConceptRow>("SELECT * FROM canonical_concepts ORDER BY id ASC");
    },
    /** Every node<->concept anchor, oldest first. */
    async listAnchors(): Promise<NodeConceptAnchorRow[]> {
      return sql.select<NodeConceptAnchorRow>(
        "SELECT * FROM node_concept_anchors ORDER BY anchored_at ASC",
      );
    },
    /** Persists crosswalk verdicts once and for all — INSERT OR REPLACE so a pair judged again
     * (should that ever happen) overwrites rather than duplicates, but callers should treat an
     * existing (node_id, concept_id) row as a fact never worth re-asking the LLM about. */
    async upsertAnchors(rows: readonly NodeConceptAnchorRow[]): Promise<void> {
      for (const row of rows) {
        await sql.execute(
          `INSERT OR REPLACE INTO node_concept_anchors
             (node_id, concept_id, verdict, confidence, method, reason, anchored_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            row.node_id,
            row.concept_id,
            row.verdict,
            row.confidence,
            row.method,
            row.reason,
            row.anchored_at,
          ],
        );
      }
    },
  };
}
