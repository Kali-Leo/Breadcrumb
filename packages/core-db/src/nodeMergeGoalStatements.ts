/**
 * Purpose: the merge executor's goals half. `goals.node_ids_json` stores knowledge node ids
 * inside a JSON array, so no foreign key exists and `pragma_foreign_key_list` cannot see the
 * reference — nodeMergeRepository's schema-drift tripwire was blind to it, and every merge
 * left the goal pointing at a deleted node. gapAndPath then counted that dead id in the
 * denominator forever, so the goal could never reach 100%.
 * Internal seam of nodeMergeStatements.ts; not re-exported from the package entry.
 * Main exports: buildMergeGoalStatements, rewriteGoalNodeIds.
 */
import { NodeIdsJsonSchema, parseJsonColumn } from "./jsonColumns";
import type { GoalRow } from "./knowledgeTypes";
import type { SqlTransactionStatement } from "./types";

/**
 * The duplicate's id replaced by the canonical's, then de-duplicated keeping first position —
 * a goal that already listed both nodes must end up with ONE entry, or coverage's denominator
 * silently counts the same node twice. Returns null when nothing changes, and also when the
 * column will not parse: an unreadable goal is left exactly as it is rather than being
 * overwritten with a guess (jsonColumns.ts's rule — never guess on behalf of a bad row).
 */
export function rewriteGoalNodeIds(
  nodeIdsJson: string,
  canonicalId: string,
  duplicateId: string,
): string | null {
  const nodeIds = parseJsonColumn(NodeIdsJsonSchema, nodeIdsJson);
  if (nodeIds === null || !nodeIds.includes(duplicateId)) return null;
  const rewritten: string[] = [];
  for (const nodeId of nodeIds) {
    const mapped = nodeId === duplicateId ? canonicalId : nodeId;
    if (!rewritten.includes(mapped)) rewritten.push(mapped);
  }
  return JSON.stringify(rewritten);
}

/**
 * One UPDATE per goal that actually mentions the duplicate.
 *
 * `updated_at` is deliberately NOT bumped: goalsRepo.listAll orders by it, and a background
 * dedup sweep must not reshuffle the learner's goal list to announce a repair they never
 * asked for.
 */
export function buildMergeGoalStatements(
  goals: readonly GoalRow[],
  canonicalId: string,
  duplicateId: string,
): SqlTransactionStatement[] {
  const statements: SqlTransactionStatement[] = [];
  for (const goal of goals) {
    const nodeIdsJson = rewriteGoalNodeIds(goal.node_ids_json, canonicalId, duplicateId);
    if (nodeIdsJson === null) continue;
    statements.push({
      sql: "UPDATE goals SET node_ids_json = ? WHERE id = ?",
      params: [nodeIdsJson, goal.id],
    });
  }
  return statements;
}
