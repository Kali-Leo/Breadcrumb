/**
 * Purpose: the spec-015-#4 duplicate-node merge executor — folds every trace of a duplicate
 * knowledge node into its canonical node and deletes the duplicate, as ONE transaction so a
 * crash mid-merge can never leave the knowledge tree half re-pointed.
 * Main exports: createNodeMergeRepo, MERGE_REFERENCING_TABLES; the statement batch itself
 * lives in nodeMergeStatements.ts.
 */

import type { KnowledgeEdgeRow, KnowledgeNodeRow, NodeMergeRow } from "./knowledgeTypes";
import { buildMergeNodeStatements } from "./nodeMergeStatements";
import type { SqlClient } from "./types";

export type { MergeNodeInput } from "./nodeMergeStatements";

/**
 * Every table whose rows point at a knowledge_nodes row and therefore MUST be handled by the
 * merge batch. Kept as data so nodeMergeRepository.test.ts can enumerate the live schema
 * (pragma foreign_key_list) and fail the moment a new referencing table appears without a
 * matching statement here — the 2026-08-27 production failure was exactly this list drifting
 * out of date (node_concept_anchors was added by migration 0020 and never wired in, so every
 * real merge hit FOREIGN KEY constraint failed and rolled back).
 *
 * node_sightings.origin_node_id and companion_proposals.node_id carry node ids WITHOUT a
 * declared foreign key, so pragma cannot find them; they are listed here anyway because
 * leaving them pointing at a deleted node is the same bug, just silent.
 */
export const MERGE_REFERENCING_TABLES: readonly string[] = [
  "knowledge_nodes", // parent_id
  "node_sightings", // node_id AND origin_node_id
  "node_embeddings",
  "map_place_names",
  "knowledge_edges", // source_id / target_id
  "interest_signals",
  "mastery_claims",
  "node_aliases",
  "node_concept_anchors",
  "companion_proposals",
  "node_pair_verdicts",
];

/** Executes one real merge (spec 015 #4): folds every trace of `duplicateId` into
 * `canonicalId` and deletes the duplicate node. Reuses the statement builders in
 * knowledgeStatements.ts, so the edge upsert's conflict rule and the alias insert's
 * insert-or-ignore rule stay identical to the repos' own writes. */
export function createNodeMergeRepo(sql: SqlClient) {
  return {
    /** Reads the duplicate's row and touched edges first (see SqlClient.executeTransaction's
     * contract — the batch is precomputed from that snapshot), then runs
     * buildMergeNodeStatements as ONE atomic batch. `mergeId` identifies the node_merges audit
     * row; callers pass their own id generator's value. */
    async mergeNode(
      canonicalId: string,
      duplicateId: string,
      duplicateLabel: string,
      nowIso: string,
      mergeId: string,
    ): Promise<void> {
      const [touchedEdges, duplicateRows] = await Promise.all([
        sql.select<KnowledgeEdgeRow>(
          "SELECT * FROM knowledge_edges WHERE source_id = ? OR target_id = ?",
          [duplicateId, duplicateId],
        ),
        sql.select<KnowledgeNodeRow>("SELECT * FROM knowledge_nodes WHERE id = ?", [duplicateId]),
      ]);

      await sql.executeTransaction(
        buildMergeNodeStatements({
          canonicalId,
          duplicateId,
          duplicateLabel,
          duplicateSnapshot: duplicateRows[0] ?? null,
          mergeId,
          touchedEdges,
          nowIso,
        }),
      );
    },
    /** Every recorded merge, newest first — the audit trail behind "these two were folded
     * together", and the material an undo would replay. */
    async listMerges(): Promise<NodeMergeRow[]> {
      return sql.select<NodeMergeRow>("SELECT * FROM node_merges ORDER BY merged_at DESC, id DESC");
    },
  };
}
