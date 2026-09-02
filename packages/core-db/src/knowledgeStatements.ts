/**
 * Purpose: the knowledge-graph writes that more than one module has to issue identically —
 * the confidence-guarded edge upsert, the edge delete and the insert-or-ignore alias insert —
 * as precomputed transaction statements. Internal seam shared by edgesRepository.ts,
 * aliasesRepository.ts and nodeMergeRepository.ts; deliberately not re-exported from the
 * package entry, so no caller outside core-db can assemble knowledge SQL by hand.
 * Main exports: buildKnowledgeEdgeUpsertStatement, buildKnowledgeEdgeRemoveStatement,
 * buildNodeAliasInsertStatement.
 */
import type { KnowledgeEdgeRow, NodeAliasRow } from "./knowledgeTypes";
import type { SqlTransactionStatement } from "./types";

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
