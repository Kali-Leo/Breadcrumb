/**
 * Purpose: SQL statements for node_aliases — labels the synonym gate (spec 015) judged
 * identical to an existing node, so a later extraction round hits the node directly instead
 * of asking the LLM again. The insert goes through knowledgeStatements.ts, shared with the
 * merge executor.
 * Main exports: createNodeAliasesRepo factory.
 */
import { buildNodeAliasInsertStatement } from "./knowledgeStatements";
import type { NodeAliasRow } from "./knowledgeTypes";
import type { SqlClient } from "./types";

export function createNodeAliasesRepo(sql: SqlClient) {
  return {
    /** Insert-or-ignore: a label already aliased (e.g. re-judged "同一" in a later round)
     * keeps its first-recorded target instead of being silently overwritten. */
    async insert(row: NodeAliasRow): Promise<void> {
      const statement = buildNodeAliasInsertStatement(row);
      await sql.execute(statement.sql, statement.params);
    },
    async findByLabel(aliasLabel: string): Promise<NodeAliasRow | null> {
      const rows = await sql.select<NodeAliasRow>(
        "SELECT * FROM node_aliases WHERE alias_label = ?",
        [aliasLabel],
      );
      return rows[0] ?? null;
    },
    /** Every alias ever recorded — raw material for planNodeChanges' aliasNodeIdByLabel input. */
    async listAll(): Promise<NodeAliasRow[]> {
      return sql.select<NodeAliasRow>("SELECT * FROM node_aliases ORDER BY created_at ASC");
    },
  };
}
