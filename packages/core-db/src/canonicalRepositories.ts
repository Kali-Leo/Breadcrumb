/**
 * Purpose: SQL statements for the canonical-concept crosswalk (spec 025) — a concept-space
 * shared by every comparison profile, the anchors judging user knowledge nodes against it,
 * and the cached local embedding of each concept (migration 0046).
 * Main exports: createCanonicalRepo factory.
 */
import type {
  CanonicalConceptEmbeddingRow,
  CanonicalConceptRow,
  NodeConceptAnchorRow,
} from "./comparisonTypes";
import type { SqlClient, SqlTransactionStatement } from "./types";

const CONCEPT_UPSERT_SQL = `INSERT OR REPLACE INTO canonical_concepts
    (id, label, aliases_json, source_ref, created_at)
  VALUES (?, ?, ?, ?, ?)`;

const ANCHOR_UPSERT_SQL = `INSERT OR REPLACE INTO node_concept_anchors
    (node_id, concept_id, verdict, confidence, method, reason, anchored_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`;

const CONCEPT_EMBEDDING_UPSERT_SQL = `INSERT OR REPLACE INTO canonical_concept_embeddings
    (concept_id, content_hash, vector_json, created_at)
  VALUES (?, ?, ?, ?)`;

export function createCanonicalRepo(sql: SqlClient) {
  return {
    /** Persists concepts once and for all — INSERT OR REPLACE so re-importing a concept (e.g.
     * a refreshed source_ref) overwrites rather than duplicates. Additive-idempotent: never
     * deletes existing concepts, since node_concept_anchors and comparison_profile_items
     * reference them by id.
     *
     * One transaction, not ~800 separate round trips: each `execute` is an IPC hop plus its
     * own implicit transaction (fsync), which measured two orders of magnitude slower on the
     * real inventory (design audit 2026-08-28, 数据层 B8). */
    async upsertConcepts(rows: readonly CanonicalConceptRow[]): Promise<void> {
      if (rows.length === 0) return;
      const statements: SqlTransactionStatement[] = rows.map((row) => ({
        sql: CONCEPT_UPSERT_SQL,
        params: [row.id, row.label, row.aliases_json, row.source_ref, row.created_at],
      }));
      await sql.executeTransaction(statements);
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
     * existing (node_id, concept_id) row as a fact never worth re-asking the LLM about.
     * One transaction per batch, for the same reason as upsertConcepts. */
    async upsertAnchors(rows: readonly NodeConceptAnchorRow[]): Promise<void> {
      if (rows.length === 0) return;
      const statements: SqlTransactionStatement[] = rows.map((row) => ({
        sql: ANCHOR_UPSERT_SQL,
        params: [
          row.node_id,
          row.concept_id,
          row.verdict,
          row.confidence,
          row.method,
          row.reason,
          row.anchored_at,
        ],
      }));
      await sql.executeTransaction(statements);
    },
    /** Every cached concept embedding (migration 0046). The caller compares content_hash
     * against the text it is about to embed and only re-embeds the misses. */
    async listConceptEmbeddings(): Promise<CanonicalConceptEmbeddingRow[]> {
      return sql.select<CanonicalConceptEmbeddingRow>("SELECT * FROM canonical_concept_embeddings");
    },
    /** Stores freshly computed concept vectors, one transaction for the whole batch. */
    async upsertConceptEmbeddings(rows: readonly CanonicalConceptEmbeddingRow[]): Promise<void> {
      if (rows.length === 0) return;
      const statements: SqlTransactionStatement[] = rows.map((row) => ({
        sql: CONCEPT_EMBEDDING_UPSERT_SQL,
        params: [row.concept_id, row.content_hash, row.vector_json, row.created_at],
      }));
      await sql.executeTransaction(statements);
    },
  };
}
