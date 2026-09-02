/**
 * Purpose: SQL statements for knowledge_edges — the directed requires/helps structure between
 * knowledge nodes (spec 010). Writes go through knowledgeStatements.ts so the merge executor
 * issues byte-identical SQL.
 * Main exports: createKnowledgeEdgesRepo factory.
 */
import {
  buildKnowledgeEdgeRemoveStatement,
  buildKnowledgeEdgeUpsertStatement,
} from "./knowledgeStatements";
import type { KnowledgeEdgeRow, KnowledgeEdgeType } from "./knowledgeTypes";
import type { SqlClient } from "./types";

export function createKnowledgeEdgesRepo(sql: SqlClient) {
  return {
    /** Insert, or on conflict keep whichever judgment has higher confidence — a later
     * lower-confidence pass never downgrades an already-recorded edge. */
    async upsert(row: KnowledgeEdgeRow): Promise<void> {
      const statement = buildKnowledgeEdgeUpsertStatement(row);
      await sql.execute(statement.sql, statement.params);
    },
    /** Every edge, oldest first — raw material for the graph algorithms (feature-graph). */
    async listAll(): Promise<KnowledgeEdgeRow[]> {
      return sql.select<KnowledgeEdgeRow>(
        "SELECT * FROM knowledge_edges ORDER BY created_at ASC, id ASC",
      );
    },
    async listOutgoing(nodeId: string, edgeType?: KnowledgeEdgeType): Promise<KnowledgeEdgeRow[]> {
      return edgeType === undefined
        ? sql.select<KnowledgeEdgeRow>(
            "SELECT * FROM knowledge_edges WHERE source_id = ? ORDER BY created_at ASC, id ASC",
            [nodeId],
          )
        : sql.select<KnowledgeEdgeRow>(
            "SELECT * FROM knowledge_edges WHERE source_id = ? AND edge_type = ? ORDER BY created_at ASC, id ASC",
            [nodeId, edgeType],
          );
    },
    async listIncoming(nodeId: string, edgeType?: KnowledgeEdgeType): Promise<KnowledgeEdgeRow[]> {
      return edgeType === undefined
        ? sql.select<KnowledgeEdgeRow>(
            "SELECT * FROM knowledge_edges WHERE target_id = ? ORDER BY created_at ASC, id ASC",
            [nodeId],
          )
        : sql.select<KnowledgeEdgeRow>(
            "SELECT * FROM knowledge_edges WHERE target_id = ? AND edge_type = ? ORDER BY created_at ASC, id ASC",
            [nodeId, edgeType],
          );
    },
    async remove(id: string): Promise<void> {
      const statement = buildKnowledgeEdgeRemoveStatement(id);
      await sql.execute(statement.sql, statement.params);
    },
  };
}
