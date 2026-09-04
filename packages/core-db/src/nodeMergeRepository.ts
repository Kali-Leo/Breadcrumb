/**
 * Purpose: the spec-015-#4 duplicate-node merge executor — folds every trace of a duplicate
 * knowledge node into its canonical node and deletes the duplicate, as ONE transaction so a
 * crash mid-merge can never leave the knowledge tree half re-pointed.
 * Main exports: createNodeMergeRepo, MERGE_REFERENCING_TABLES, MERGE_NODE_ID_JSON_COLUMNS;
 * the statement batch itself lives in nodeMergeStatements.ts (edges in
 * nodeMergeEdgeStatements.ts, goals in nodeMergeGoalStatements.ts).
 */

import type { GoalRow, KnowledgeNodeRow, NodeMergeRow } from "./knowledgeTypes";
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

/**
 * The node references SQLite itself cannot see: knowledge node ids stored INSIDE a JSON
 * column. `pragma_foreign_key_list` enumerates declared foreign keys between columns, and a
 * JSON array is one opaque TEXT value to the engine — no pragma, no index, no query can
 * discover that `goals.node_ids_json` holds node ids. So the list is written by hand, and
 * nodeMergeRepository.test.ts pins it from the other side: it enumerates EVERY `*_json`
 * column in the live schema and demands each one be classified as either a node-id column
 * (here) or an explicitly node-id-free one. A migration that adds a JSON column therefore
 * cannot be merged without someone answering the question.
 *
 * This was not theoretical: goals were missed, so every merge left a goal pointing at a
 * deleted node and gapAndPath's coverage could never reach 100% again.
 */
export const MERGE_NODE_ID_JSON_COLUMNS: readonly string[] = ["goals.node_ids_json"];

/** Executes one real merge (spec 015 #4): folds every trace of `duplicateId` into
 * `canonicalId` and deletes the duplicate node. Reuses buildNodeAliasInsertStatement from
 * knowledgeStatements.ts so the alias insert's insert-or-ignore rule stays identical to the
 * repos' own writes; the edge fold reimplements the upsert's confidence rule set-based, and
 * nodeMergeRepository.test.ts pins the two against each other. */
export function createNodeMergeRepo(sql: SqlClient) {
  return {
    /** Runs buildMergeNodeStatements as ONE atomic batch. `mergeId` identifies the
     * node_merges audit row; callers pass their own id generator's value.
     *
     * The two reads below are the only ones left outside the transaction, and neither can
     * fail a merge: the duplicate's row only fills the audit snapshot, and goals carry no
     * foreign key. knowledge_edges USED to be read here too, and that one could — an edge
     * inserted by a concurrent chat round after the read was invisible to the batch and its
     * foreign key then failed the final node delete, rolling the whole merge back. The edge
     * half is now set-based SQL evaluated inside the transaction (nodeMergeEdgeStatements.ts)
     * and reads nothing up front. */
    async mergeNode(
      canonicalId: string,
      duplicateId: string,
      duplicateLabel: string,
      nowIso: string,
      mergeId: string,
    ): Promise<void> {
      const [goals, duplicateRows] = await Promise.all([
        sql.select<GoalRow>("SELECT * FROM goals"),
        sql.select<KnowledgeNodeRow>("SELECT * FROM knowledge_nodes WHERE id = ?", [duplicateId]),
      ]);

      await sql.executeTransaction(
        buildMergeNodeStatements({
          canonicalId,
          duplicateId,
          duplicateLabel,
          duplicateSnapshot: duplicateRows[0] ?? null,
          mergeId,
          goals,
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
