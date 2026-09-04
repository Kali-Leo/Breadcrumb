/**
 * Purpose: the spec-015-#4 duplicate-node merge as one precomputed statement batch. Internal
 * seam of nodeMergeRepository.ts — deliberately not re-exported from the package entry, so no
 * caller outside core-db can assemble a merge by hand and bypass the repo's read-then-batch
 * contract.
 * Main exports: MergeNodeInput, buildMergeNodeStatements.
 */
import { buildNodeAliasInsertStatement } from "./knowledgeStatements";
import type { GoalRow, KnowledgeNodeRow } from "./knowledgeTypes";
import { buildMergeEdgeStatements } from "./nodeMergeEdgeStatements";
import { buildMergeGoalStatements } from "./nodeMergeGoalStatements";
import type { SqlTransactionStatement } from "./types";

/** How far up the parent chain the cycle guard looks. The map only draws four tiers and the
 * deepest tree anyone has ever produced is a handful of levels, so this is orders of
 * magnitude of headroom; it exists only so a database that ALREADY contains a parent cycle
 * cannot make the recursive CTE run forever. */
const ANCESTOR_SCAN_DEPTH = 1000;

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
  /** Every goal row, so the ones listing the duplicate can be rewritten. Read before the
   * transaction like duplicateSnapshot: goals carry no foreign key, so a stale read here can
   * at worst miss a goal edited in the same instant — it can never fail the merge. */
  goals: readonly GoalRow[];
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
 * 6. Break the parent cycle BEFORE re-pointing children (see buildCycleGuardStatement), then
 *    re-point any child's parent_id.
 * 7. Fold every knowledge_edges row touching the duplicate onto the canonical.
 * 8. Rewrite goals.node_ids_json, the one node reference SQLite cannot see.
 * 9. Record duplicateLabel as an alias of canonicalId (insert-or-ignore).
 * 10. Delete the duplicate's embedding and its knowledge_nodes row.
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
    buildCycleGuardStatement(canonicalId, duplicateId),
    {
      // `AND id <> ?` is the belt to the cycle guard's braces: even if the guard ever fails to
      // fire, the canonical can never become its own parent, which is the shape that made a
      // whole subtree disappear from the map.
      sql: "UPDATE knowledge_nodes SET parent_id = ? WHERE parent_id = ? AND id <> ?",
      params: [canonicalId, duplicateId, canonicalId],
    },
    ...buildMergeEdgeStatements(canonicalId, duplicateId),
    ...buildMergeGoalStatements(input.goals, canonicalId, duplicateId),
    buildNodeAliasInsertStatement({
      alias_label: input.duplicateLabel,
      node_id: canonicalId,
      created_at: input.nowIso,
    }),
    { sql: "DELETE FROM node_embeddings WHERE node_id = ?", params: [duplicateId] },
    { sql: "DELETE FROM knowledge_nodes WHERE id = ?", params: [duplicateId] },
  ];
  return statements;
}

/**
 * The fix for the merge that ate a subtree. When the duplicate is an ANCESTOR of the
 * canonical, re-pointing the duplicate's children at the canonical closes a loop: the child
 * that sits on the canonical's own ancestor chain now hangs off the canonical, so the
 * canonical is its own ancestor. Nothing throws — the foreign key is satisfied — but a node
 * on a cycle is never in indexChildren's root bucket, so the canonical AND everything under
 * it vanish from the map with no error anywhere. The shortest form is duplicate == the
 * canonical's parent, which the mechanical tier reaches roughly half the time whenever a
 * same-batch parent/child pair normalizes to the same label (their created_at is identical,
 * so the canonical is picked by random UUID order).
 *
 * The repair: before any child moves, the canonical takes the duplicate's OWN place in the
 * tree — its parent becomes the duplicate's parent (NULL if that is the canonical itself,
 * which means the pair was already a cycle). The chain then leaves the duplicate's subtree
 * entirely and re-pointing the children is safe.
 *
 * Chosen over "refuse the merge and log an ai_failures row" for two reasons. The pair is
 * genuinely a duplicate — refusing keeps a node the judge already paid to declare identical,
 * and dedupSweep caches every verdict, so a refused pair is never re-judged and the duplicate
 * survives forever with no user-visible sign. And refusing would need the ancestry answer
 * BEFORE the batch is built, i.e. another read outside the transaction — reopening the very
 * read-then-write window this file's edge half was rewritten to close. Reparenting is
 * expressible as one set-based statement inside the batch, so it needs no read at all.
 */
function buildCycleGuardStatement(
  canonicalId: string,
  duplicateId: string,
): SqlTransactionStatement {
  return {
    sql: `WITH RECURSIVE ancestor_chain(node_id, depth) AS (
            SELECT parent_id, 1 FROM knowledge_nodes WHERE id = ? AND parent_id IS NOT NULL
            UNION ALL
            SELECT n.parent_id, c.depth + 1
              FROM ancestor_chain c JOIN knowledge_nodes n ON n.id = c.node_id
             WHERE n.parent_id IS NOT NULL AND c.depth < ${ANCESTOR_SCAN_DEPTH}
          )
          UPDATE knowledge_nodes
             SET parent_id = (SELECT NULLIF(d.parent_id, ?) FROM knowledge_nodes d WHERE d.id = ?)
           WHERE id = ?
             AND EXISTS (SELECT 1 FROM ancestor_chain WHERE node_id = ?)`,
    params: [canonicalId, canonicalId, duplicateId, canonicalId, duplicateId],
  };
}
