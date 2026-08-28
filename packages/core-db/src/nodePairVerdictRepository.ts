/**
 * Purpose: the dedup sweep's negative cache (migration 0045) — every synonym-judge verdict
 * over a pair of EXISTING nodes, "different" included, so the same pair is asked about once
 * ever instead of on every startup. Mirrors the discipline node_concept_anchors already had.
 * Main exports: normalizeNodePairKey, createNodePairVerdictsRepo.
 */
import type { AlignmentVerdict, NodePairVerdictRow, SqlClient } from "./types";

/** One pair, one key: the two node ids sorted, so a pair generated as (B, A) by one sweep and
 * as (A, B) by the next resolves to the same row. */
export function normalizeNodePairKey(
  nodeIdA: string,
  nodeIdB: string,
): { nodeAId: string; nodeBId: string } {
  return nodeIdA <= nodeIdB
    ? { nodeAId: nodeIdA, nodeBId: nodeIdB }
    : { nodeAId: nodeIdB, nodeBId: nodeIdA };
}

export function createNodePairVerdictsRepo(sql: SqlClient) {
  return {
    /** Every cached verdict. The caller turns these into a skip-set keyed by
     * `${node_a_id}:${node_b_id}` (already normalized on write). */
    async listAll(): Promise<NodePairVerdictRow[]> {
      return sql.select<NodePairVerdictRow>("SELECT * FROM node_pair_verdicts");
    },
    /** Records one verdict, normalizing the pair order first. INSERT OR REPLACE so a pair
     * re-judged after a merge changed one side's meaning overwrites rather than duplicating. */
    async record(
      nodeIdA: string,
      nodeIdB: string,
      verdict: AlignmentVerdict,
      judgedAt: string,
    ): Promise<void> {
      const { nodeAId, nodeBId } = normalizeNodePairKey(nodeIdA, nodeIdB);
      await sql.execute(
        `INSERT OR REPLACE INTO node_pair_verdicts (node_a_id, node_b_id, verdict, judged_at)
         VALUES (?, ?, ?, ?)`,
        [nodeAId, nodeBId, verdict, judgedAt],
      );
    },
  };
}
