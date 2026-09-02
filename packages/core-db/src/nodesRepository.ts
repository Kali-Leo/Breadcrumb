/**
 * Purpose: SQL statements for knowledge_nodes — the nodes of the learner's own knowledge
 * tree. Footprints, edges and aliases each live in their own sibling file; embeddings in
 * nodeEmbeddingRepository.ts and the duplicate merge in nodeMergeRepository.ts.
 * Main exports: createKnowledgeNodesRepo factory.
 */
import type { KnowledgeNodeRow } from "./knowledgeTypes";
import type { SqlClient } from "./types";

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
    /** Distinct nodes with ANY footprint inside [fromIso, toIso) — met for the first time or
     * met again — in the order they were first met that day. The raw material of the daily
     * trail summary: a day's learning is what was extracted or revisited, not only what was
     * new. */
    async listSightedBetween(fromIso: string, toIso: string): Promise<KnowledgeNodeRow[]> {
      return sql.select<KnowledgeNodeRow>(
        `SELECT n.* FROM knowledge_nodes n
         JOIN (SELECT node_id, MIN(created_at) seen FROM node_sightings
                WHERE created_at >= ? AND created_at < ? GROUP BY node_id) s
           ON s.node_id = n.id
         ORDER BY s.seen ASC, n.id ASC`,
        [fromIso, toIso],
      );
    },
  };
}
