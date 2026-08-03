/**
 * Purpose: SQL statements for the knowledge-graph domain — tree nodes, their local
 * embeddings, sightings (footprints), the directed requires/helps edges (spec 010), and
 * node-dedup aliases (spec 015).
 * Main exports: knowledgeNodesRepo, nodeEmbeddingsRepo, nodeSightingsRepo, knowledgeEdgesRepo,
 * nodeAliasesRepo.
 */
import type {
  KnowledgeEdgeRow,
  KnowledgeEdgeType,
  KnowledgeNodeRow,
  NodeAliasRow,
  NodeEmbeddingRow,
  NodeSightingRow,
  SqlClient,
} from "./types";

export function createKnowledgeNodesRepo(sql: SqlClient) {
  return {
    async insert(row: KnowledgeNodeRow): Promise<void> {
      await sql.execute(
        "INSERT INTO knowledge_nodes (id, parent_id, label, summary, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [row.id, row.parent_id, row.label, row.summary, row.kind, row.created_at],
      );
    },
    /** The user's whole tree, oldest first. */
    async listAll(): Promise<KnowledgeNodeRow[]> {
      return sql.select<KnowledgeNodeRow>(
        "SELECT * FROM knowledge_nodes ORDER BY created_at ASC, id ASC",
      );
    },
    /** Nodes first learned inside [fromIso, toIso) — the raw material of the daily trail. */
    async listCreatedBetween(fromIso: string, toIso: string): Promise<KnowledgeNodeRow[]> {
      return sql.select<KnowledgeNodeRow>(
        "SELECT * FROM knowledge_nodes WHERE created_at >= ? AND created_at < ? ORDER BY created_at ASC",
        [fromIso, toIso],
      );
    },
  };
}

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

export function createNodeSightingsRepo(sql: SqlClient) {
  return {
    async record(row: NodeSightingRow): Promise<void> {
      await sql.execute(
        "INSERT INTO node_sightings (id, node_id, conversation_id, message_id, created_at) VALUES (?, ?, ?, ?, ?)",
        [row.id, row.node_id, row.conversation_id, row.message_id, row.created_at],
      );
    },
    /** Every footprint ever — raw material for the memory (fog) engine. */
    async listAll(): Promise<NodeSightingRow[]> {
      return sql.select<NodeSightingRow>("SELECT * FROM node_sightings ORDER BY created_at ASC");
    },
    /** This conversation's footprints in walking order — the session trail. */
    async listByConversation(conversationId: string): Promise<NodeSightingRow[]> {
      return sql.select<NodeSightingRow>(
        "SELECT * FROM node_sightings WHERE conversation_id = ? ORDER BY created_at ASC, id ASC",
        [conversationId],
      );
    },
  };
}

export function createKnowledgeEdgesRepo(sql: SqlClient) {
  return {
    /** Insert, or on conflict keep whichever judgment has higher confidence — a later
     * lower-confidence pass never downgrades an already-recorded edge. */
    async upsert(row: KnowledgeEdgeRow): Promise<void> {
      await sql.execute(
        `INSERT INTO knowledge_edges
           (id, source_id, target_id, edge_type, weight, confidence, origin, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_id, target_id, edge_type) DO UPDATE SET
           weight = excluded.weight,
           confidence = excluded.confidence,
           origin = excluded.origin,
           created_at = excluded.created_at
         WHERE excluded.confidence > knowledge_edges.confidence`,
        [
          row.id,
          row.source_id,
          row.target_id,
          row.edge_type,
          row.weight,
          row.confidence,
          row.origin,
          row.created_at,
        ],
      );
    },
    /** Every edge, oldest first — raw material for the graph algorithms (plugin-graph). */
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
      await sql.execute("DELETE FROM knowledge_edges WHERE id = ?", [id]);
    },
  };
}

export function createNodeAliasesRepo(sql: SqlClient) {
  return {
    /** Insert-or-ignore: a label already aliased (e.g. re-judged "同一" in a later round)
     * keeps its first-recorded target instead of being silently overwritten. */
    async insert(row: NodeAliasRow): Promise<void> {
      await sql.execute(
        "INSERT OR IGNORE INTO node_aliases (alias_label, node_id, created_at) VALUES (?, ?, ?)",
        [row.alias_label, row.node_id, row.created_at],
      );
    },
    async findByLabel(aliasLabel: string): Promise<NodeAliasRow | null> {
      const rows = await sql.select<NodeAliasRow>(
        "SELECT * FROM node_aliases WHERE alias_label = ?",
        [aliasLabel],
      );
      return rows[0] ?? null;
    },
    /** Every alias ever recorded — raw material for planNodeChanges' aliasNodeIdByLabel input. */
    async listAll(): Promise<NodeAliasRow[]> {
      return sql.select<NodeAliasRow>("SELECT * FROM node_aliases ORDER BY created_at ASC");
    },
  };
}
