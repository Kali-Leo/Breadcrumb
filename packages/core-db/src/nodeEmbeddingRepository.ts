/**
 * Purpose: SQL statements for locally-computed knowledge-node embeddings — the upsert cache,
 * the single-node lookup used by explore-door concept-guess grading, and the
 * missing-embedding backfill queue.
 * Main exports: createNodeEmbeddingsRepo.
 */
import type { KnowledgeNodeRow, NodeEmbeddingRow } from "./knowledgeTypes";
import type { SqlClient } from "./types";

export function createNodeEmbeddingsRepo(sql: SqlClient) {
  return {
    async upsert(row: NodeEmbeddingRow): Promise<void> {
      await sql.execute(
        `INSERT INTO node_embeddings (node_id, model, vector_json, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(node_id) DO UPDATE SET
           model = excluded.model, vector_json = excluded.vector_json, created_at = excluded.created_at`,
        [row.node_id, row.model, row.vector_json, row.created_at],
      );
    },
    /** One node's embedding, or null when it has none yet — used to grade a concept guess
     * against a single door's node without loading the whole table. */
    async getByNode(nodeId: string, model?: string): Promise<NodeEmbeddingRow | null> {
      const rows =
        model === undefined
          ? await sql.select<NodeEmbeddingRow>(
              "SELECT * FROM node_embeddings WHERE node_id = ? LIMIT 1",
              [nodeId],
            )
          : await sql.select<NodeEmbeddingRow>(
              "SELECT * FROM node_embeddings WHERE node_id = ? AND model = ? LIMIT 1",
              [nodeId, model],
            );
      return rows[0] ?? null;
    },
    /**
     * Nodes that still lack a usable embedding — the backfill queue.
     *
     * "Usable" means "computed by the model this build runs". A vector from another model is
     * not a weaker vector, it is one whose cosine against a current vector is a plausible
     * number with no meaning, and the width check in parseVectorRows cannot see the case that
     * matters: 384 dimensions from e5 and 384 dimensions from gte look identical to it. So the
     * join carries the model and a row from any other one counts as absent — which is also
     * what makes a model swap self-healing instead of a manual purge.
     */
    async listNodesMissingEmbedding(model: string): Promise<KnowledgeNodeRow[]> {
      return sql.select<KnowledgeNodeRow>(
        `SELECT k.* FROM knowledge_nodes k
         LEFT JOIN node_embeddings e ON e.node_id = k.id AND e.model = ?
         WHERE e.node_id IS NULL ORDER BY k.created_at ASC`,
        [model],
      );
    },

    /** Every vector this build can actually compare, for the callers that load the whole
     * table (the map's layout, duplicate detection). Filtering here rather than at each call
     * site is what keeps "different models never mix" a property instead of a convention. */
    async listAllForModel(model: string): Promise<NodeEmbeddingRow[]> {
      return sql.select<NodeEmbeddingRow>("SELECT * FROM node_embeddings WHERE model = ?", [model]);
    },
  };
}
