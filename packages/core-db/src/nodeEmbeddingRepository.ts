/**
 * Purpose: SQL statements for locally-computed knowledge-node embeddings — the upsert cache,
 * the single-node lookup used by explore-door concept-guess grading (spec 039), and the
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
    async listAll(): Promise<NodeEmbeddingRow[]> {
      return sql.select<NodeEmbeddingRow>("SELECT * FROM node_embeddings");
    },
    /** One node's embedding, or null when it has none yet — used to grade a concept guess
     * against a single door's node (spec 039) without loading the whole table. */
    async getByNode(nodeId: string): Promise<NodeEmbeddingRow | null> {
      const rows = await sql.select<NodeEmbeddingRow>(
        "SELECT * FROM node_embeddings WHERE node_id = ? LIMIT 1",
        [nodeId],
      );
      return rows[0] ?? null;
    },
    /** Nodes that still lack an embedding — the backfill queue. */
    async listNodesMissingEmbedding(): Promise<KnowledgeNodeRow[]> {
      return sql.select<KnowledgeNodeRow>(
        `SELECT k.* FROM knowledge_nodes k
         LEFT JOIN node_embeddings e ON e.node_id = k.id
         WHERE e.node_id IS NULL ORDER BY k.created_at ASC`,
      );
    },
  };
}
