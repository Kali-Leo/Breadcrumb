/**
 * Purpose: SQL statements for node_sightings — one row per footprint, i.e. per time a
 * conversation met or re-met a knowledge node. The raw material of the memory (fog) engine.
 * Main exports: createNodeSightingsRepo factory.
 */
import type { NodeSightingRow } from "./knowledgeTypes";
import type { SqlClient } from "./types";

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
    /**
     * The earliest footprint of one concept that still points at a message — where it was
     * first met, for jumping back to the conversation it was learned in (spec 005 §5). Rows
     * whose message is gone (a deleted conversation) are skipped rather than returned as a
     * dead link.
     */
    async firstWithMessage(nodeId: string): Promise<NodeSightingRow | null> {
      const rows = await sql.select<NodeSightingRow>(
        `SELECT s.* FROM node_sightings s
           JOIN messages m ON m.id = s.message_id
          WHERE s.node_id = ? AND s.message_id IS NOT NULL
          ORDER BY s.created_at ASC, s.id ASC
          LIMIT 1`,
        [nodeId],
      );
      return rows[0] ?? null;
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
