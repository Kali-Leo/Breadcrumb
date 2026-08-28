/**
 * Purpose: SQL statements for the knowledge-graph domain — tree nodes, sightings
 * (footprints), the directed requires/helps edges (spec 010), and node-dedup aliases (spec
 * 015); node embeddings live in nodeEmbeddingRepository.ts and the duplicate-node merge
 * executor in nodeMergeRepository.ts (it shares this file's statement builders).
 * Main exports: createKnowledgeNodesRepo, createNodeSightingsRepo, createKnowledgeEdgesRepo,
 * createNodeAliasesRepo, buildKnowledgeEdgeUpsertStatement, buildKnowledgeEdgeRemoveStatement,
 * buildNodeAliasInsertStatement.
 */
import type {
  KnowledgeEdgeRow,
  KnowledgeEdgeType,
  KnowledgeNodeRow,
  NodeAliasRow,
  NodeSightingRow,
  SqlClient,
  SqlTransactionStatement,
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
    /** Nodes first SIGHTED inside [fromIso, toIso) — the raw material of the daily trail.
     * Sighting-based, not creation-based: goal-suggested nodes exist without ever having
     * been learned, and the trail must only state what actually happened. */
    async listFirstSightedBetween(fromIso: string, toIso: string): Promise<KnowledgeNodeRow[]> {
      return sql.select<KnowledgeNodeRow>(
        `SELECT n.* FROM knowledge_nodes n
         JOIN (SELECT node_id, MIN(created_at) first_seen FROM node_sightings GROUP BY node_id) f
           ON f.node_id = n.id
         WHERE f.first_seen >= ? AND f.first_seen < ?
         ORDER BY f.first_seen ASC`,
        [fromIso, toIso],
      );
    },
  };
}

export function createNodeSightingsRepo(sql: SqlClient) {
  return {
    /** Records a footprint. `grade` is optional: a caller with no retrieval signal (extraction,
     * re-encounter) omits it and the footprint lands as passive exposure ('good'). */
    async record(row: NodeSightingRow): Promise<void> {
      await sql.execute(
        "INSERT INTO node_sightings (id, node_id, conversation_id, message_id, created_at, origin_node_id, grade) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          row.id,
          row.node_id,
          row.conversation_id,
          row.message_id,
          row.created_at,
          row.origin_node_id,
          row.grade ?? "good",
        ],
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
    /** Footprints attributed to one message — message-level re-encounters (vision/09). */
    async listByMessage(messageId: string): Promise<NodeSightingRow[]> {
      return sql.select<NodeSightingRow>(
        "SELECT * FROM node_sightings WHERE message_id = ? ORDER BY created_at ASC, id ASC",
        [messageId],
      );
    },
  };
}

/** The confidence-guarded edge upsert as a transaction statement — single source of truth
 * for both createKnowledgeEdgesRepo.upsert and the merge executor's batch. */
export function buildKnowledgeEdgeUpsertStatement(row: KnowledgeEdgeRow): SqlTransactionStatement {
  return {
    sql: `INSERT INTO knowledge_edges
           (id, source_id, target_id, edge_type, weight, confidence, origin, created_at,
            reasoning, source_message_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_id, target_id, edge_type) DO UPDATE SET
           weight = excluded.weight,
           confidence = excluded.confidence,
           origin = excluded.origin,
           created_at = excluded.created_at,
           reasoning = excluded.reasoning,
           source_message_id = excluded.source_message_id
         WHERE excluded.confidence > knowledge_edges.confidence`,
    params: [
      row.id,
      row.source_id,
      row.target_id,
      row.edge_type,
      row.weight,
      row.confidence,
      row.origin,
      row.created_at,
      row.reasoning ?? null,
      row.source_message_id ?? null,
    ],
  };
}

/** Edge delete by id as a transaction statement (shared with the merge executor). */
export function buildKnowledgeEdgeRemoveStatement(id: string): SqlTransactionStatement {
  return { sql: "DELETE FROM knowledge_edges WHERE id = ?", params: [id] };
}

/** The insert-or-ignore alias insert as a transaction statement (shared with the merge
 * executor); an already-aliased label keeps its first-recorded target. */
export function buildNodeAliasInsertStatement(row: NodeAliasRow): SqlTransactionStatement {
  return {
    sql: "INSERT OR IGNORE INTO node_aliases (alias_label, node_id, created_at) VALUES (?, ?, ?)",
    params: [row.alias_label, row.node_id, row.created_at],
  };
}

export function createKnowledgeEdgesRepo(sql: SqlClient) {
  return {
    /** Insert, or on conflict keep whichever judgment has higher confidence — a later
     * lower-confidence pass never downgrades an already-recorded edge. */
    async upsert(row: KnowledgeEdgeRow): Promise<void> {
      const statement = buildKnowledgeEdgeUpsertStatement(row);
      await sql.execute(statement.sql, statement.params);
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
      const statement = buildKnowledgeEdgeRemoveStatement(id);
      await sql.execute(statement.sql, statement.params);
    },
  };
}

export function createNodeAliasesRepo(sql: SqlClient) {
  return {
    /** Insert-or-ignore: a label already aliased (e.g. re-judged "同一" in a later round)
     * keeps its first-recorded target instead of being silently overwritten. */
    async insert(row: NodeAliasRow): Promise<void> {
      const statement = buildNodeAliasInsertStatement(row);
      await sql.execute(statement.sql, statement.params);
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
