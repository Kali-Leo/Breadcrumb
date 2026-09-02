/**
 * Purpose: the spec-015-#4 duplicate-node merge as one precomputed statement batch. Internal
 * seam of nodeMergeRepository.ts — deliberately not re-exported from the package entry, so no
 * caller outside core-db can assemble a merge by hand and bypass the repo's read-then-batch
 * contract.
 * Main exports: MergeNodeInput, buildMergeNodeStatements.
 */
import {
  buildKnowledgeEdgeRemoveStatement,
  buildKnowledgeEdgeUpsertStatement,
  buildNodeAliasInsertStatement,
} from "./knowledgeStatements";
import type { KnowledgeEdgeRow, KnowledgeNodeRow } from "./knowledgeTypes";
import type { SqlTransactionStatement } from "./types";

export interface MergeNodeInput {
  canonicalId: string;
  duplicateId: string;
  duplicateLabel: string;
  /** The duplicate's whole knowledge_nodes row, snapshotted into node_merges before the row
   * is deleted. Null only when the row could not be read back (already gone) — the merge then
   * records an empty snapshot rather than skipping the audit row entirely. */
  duplicateSnapshot: KnowledgeNodeRow | null;
  /** id for the node_merges audit row. */
  mergeId: string;
  touchedEdges: readonly KnowledgeEdgeRow[];
  nowIso: string;
}

/**
 * The whole merge as one precomputed statement batch, in order:
 * 1. Snapshot the duplicate row into node_merges (audit + undo material) BEFORE anything is
 *    destroyed.
 * 2. Reassign node_sightings (node_id and origin_node_id), interest_signals, mastery_claims,
 *    node_aliases and companion_proposals from duplicateId to canonicalId — plain bulk
 *    UPDATEs, none of these has a uniqueness constraint reassignment could violate.
 * 3. map_place_names is keyed BY node_id, so reassignment can collide: UPDATE OR IGNORE moves
 *    the duplicate's custom name over only when the canonical has none (the canonical's own
 *    name always wins), then the leftover row is deleted.
 * 4. node_concept_anchors is keyed (node_id, concept_id) and its rows are pure derived
 *    judgments about the duplicate's LABEL, which is not the canonical's label — re-pointing
 *    would both collide on the key and assert something never judged. They are deleted; the
 *    anchor sweep re-judges the canonical on its own terms.
 * 5. node_pair_verdicts rows mentioning the duplicate are deleted — a cached "different"
 *    verdict about a node that no longer exists is dead weight, and after a merge the
 *    canonical deserves to be re-compared on its own.
 * 6. Re-point any child's parent_id.
 * 7. For every knowledge_edges row touching duplicateId: remove the old row, then, unless the
 *    reassignment would make it a self-loop, re-insert it via the edge upsert statement — its
 *    ON CONFLICT(source_id, target_id, edge_type) rule keeps whichever judgment has the higher
 *    confidence when the reassignment collides with an edge canonicalId already has.
 * 8. Record duplicateLabel as an alias of canonicalId (insert-or-ignore).
 * 9. Delete the duplicate's embedding and its knowledge_nodes row.
 */
export function buildMergeNodeStatements(input: MergeNodeInput): SqlTransactionStatement[] {
  const { canonicalId, duplicateId } = input;
  const reassignParams = [canonicalId, duplicateId];
  const statements: SqlTransactionStatement[] = [
    {
      sql: `INSERT INTO node_merges
              (id, canonical_id, duplicate_id, duplicate_snapshot_json, merged_at)
            VALUES (?, ?, ?, ?, ?)`,
      params: [
        input.mergeId,
        canonicalId,
        duplicateId,
        JSON.stringify(input.duplicateSnapshot),
        input.nowIso,
      ],
    },
    { sql: "UPDATE node_sightings SET node_id = ? WHERE node_id = ?", params: reassignParams },
    {
      sql: "UPDATE node_sightings SET origin_node_id = ? WHERE origin_node_id = ?",
      params: reassignParams,
    },
    { sql: "UPDATE interest_signals SET node_id = ? WHERE node_id = ?", params: reassignParams },
    { sql: "UPDATE mastery_claims SET node_id = ? WHERE node_id = ?", params: reassignParams },
    { sql: "UPDATE node_aliases SET node_id = ? WHERE node_id = ?", params: reassignParams },
    {
      sql: "UPDATE companion_proposals SET node_id = ? WHERE node_id = ?",
      params: reassignParams,
    },
    {
      sql: "UPDATE OR IGNORE map_place_names SET node_id = ? WHERE node_id = ?",
      params: reassignParams,
    },
    { sql: "DELETE FROM map_place_names WHERE node_id = ?", params: [duplicateId] },
    { sql: "DELETE FROM node_concept_anchors WHERE node_id = ?", params: [duplicateId] },
    {
      sql: "DELETE FROM node_pair_verdicts WHERE node_a_id = ? OR node_b_id = ?",
      params: [duplicateId, duplicateId],
    },
    {
      sql: "UPDATE knowledge_nodes SET parent_id = ? WHERE parent_id = ?",
      params: reassignParams,
    },
  ];

  for (const edge of input.touchedEdges) {
    statements.push(buildKnowledgeEdgeRemoveStatement(edge.id));
    const newSourceId = edge.source_id === duplicateId ? canonicalId : edge.source_id;
    const newTargetId = edge.target_id === duplicateId ? canonicalId : edge.target_id;
    if (newSourceId === newTargetId) continue; // drop: would become a self-loop
    statements.push(
      buildKnowledgeEdgeUpsertStatement({
        ...edge,
        source_id: newSourceId,
        target_id: newTargetId,
      }),
    );
  }

  statements.push(
    buildNodeAliasInsertStatement({
      alias_label: input.duplicateLabel,
      node_id: canonicalId,
      created_at: input.nowIso,
    }),
  );
  statements.push({ sql: "DELETE FROM node_embeddings WHERE node_id = ?", params: [duplicateId] });
  statements.push({ sql: "DELETE FROM knowledge_nodes WHERE id = ?", params: [duplicateId] });
  return statements;
}
