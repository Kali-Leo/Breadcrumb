/**
 * Purpose: the spec-015-#4 duplicate-node merge executor — folds every trace of a duplicate
 * knowledge node into its canonical node and deletes the duplicate, as ONE transaction so a
 * crash mid-merge can never leave the knowledge tree half re-pointed.
 * Main exports: createNodeMergeRepo.
 */
import {
  buildKnowledgeEdgeRemoveStatement,
  buildKnowledgeEdgeUpsertStatement,
  buildNodeAliasInsertStatement,
} from "./knowledgeRepositories";
import type { KnowledgeEdgeRow, SqlClient, SqlTransactionStatement } from "./types";

/** Executes one real merge (spec 015 #4): folds every trace of `duplicateId` into
 * `canonicalId` and deletes the duplicate node. Reuses the statement builders exported by
 * knowledgeRepositories.ts, so the edge upsert's conflict rule and the alias insert's
 * insert-or-ignore rule stay identical to the repos' own writes. */
export function createNodeMergeRepo(sql: SqlClient) {
  return {
    /**
     * Reads the duplicate's touched edges first, then runs everything below as ONE atomic
     * statement batch (executeTransaction), in order:
     * 1. Reassign node_sightings.node_id, interest_signals.node_id, mastery_claims.node_id
     *    and node_aliases.node_id from duplicateId to canonicalId (plain bulk UPDATEs — none
     *    of these tables has a uniqueness constraint that reassignment could violate).
     * 2. Re-point any child's parent_id from duplicateId to canonicalId.
     * 3. For every knowledge_edges row touching duplicateId: remove the old row, then, unless
     *    the reassignment would make it a self-loop (source === target after substitution),
     *    re-insert it via the edge upsert statement — its ON CONFLICT(source_id, target_id,
     *    edge_type) rule keeps whichever judgment has the higher confidence when the
     *    reassignment collides with an edge canonicalId already has.
     * 4. Record duplicateLabel as an alias of canonicalId (insert-or-ignore, so a duplicate
     *    label matching an already-aliased label keeps that alias's original target).
     * 5. Delete the duplicate's embedding and its knowledge_nodes row.
     */
    async mergeNode(
      canonicalId: string,
      duplicateId: string,
      duplicateLabel: string,
      nowIso: string,
    ): Promise<void> {
      // Read outside the transaction (see SqlClient.executeTransaction's contract): the
      // statement batch is precomputed from this snapshot.
      const touchedEdges = await sql.select<KnowledgeEdgeRow>(
        "SELECT * FROM knowledge_edges WHERE source_id = ? OR target_id = ?",
        [duplicateId, duplicateId],
      );

      const reassignParams = [canonicalId, duplicateId];
      const statements: SqlTransactionStatement[] = [
        { sql: "UPDATE node_sightings SET node_id = ? WHERE node_id = ?", params: reassignParams },
        {
          sql: "UPDATE interest_signals SET node_id = ? WHERE node_id = ?",
          params: reassignParams,
        },
        { sql: "UPDATE mastery_claims SET node_id = ? WHERE node_id = ?", params: reassignParams },
        { sql: "UPDATE node_aliases SET node_id = ? WHERE node_id = ?", params: reassignParams },
        {
          sql: "UPDATE knowledge_nodes SET parent_id = ? WHERE parent_id = ?",
          params: reassignParams,
        },
      ];

      for (const edge of touchedEdges) {
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
          alias_label: duplicateLabel,
          node_id: canonicalId,
          created_at: nowIso,
        }),
      );
      statements.push({
        sql: "DELETE FROM node_embeddings WHERE node_id = ?",
        params: [duplicateId],
      });
      statements.push({ sql: "DELETE FROM knowledge_nodes WHERE id = ?", params: [duplicateId] });

      await sql.executeTransaction(statements);
    },
  };
}
