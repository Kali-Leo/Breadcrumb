/**
 * Purpose: the merge executor's knowledge_edges half. Written as SET-BASED statements that
 * see the table AS IT IS WHEN THE TRANSACTION RUNS, not as a snapshot read before it opened.
 * That snapshot was a real hole: runDedupSweep is fire-and-forget from App.tsx while the chat
 * round's edge judge writes knowledge_edges, so an edge inserted between the read and the
 * BEGIN was invisible to the batch and its foreign key then failed the final
 * `DELETE FROM knowledge_nodes` — rolling the whole merge back.
 * Internal seam of nodeMergeStatements.ts; not re-exported from the package entry.
 * Main exports: buildMergeEdgeStatements.
 */
import type { SqlTransactionStatement } from "./types";

/** Everything buildKnowledgeEdgeUpsertStatement's `DO UPDATE SET` copies from the winning
 * judgment. The row's id and its (source_id, target_id, edge_type) key stay put, which is
 * what keeps this rewrite behaviourally identical to the upsert it replaces. */
const ABSORBED_COLUMNS = [
  "weight",
  "confidence",
  "origin",
  "created_at",
  "reasoning",
  "source_message_id",
] as const;

/**
 * Folds every knowledge_edges row touching `duplicateId` onto `canonicalId`, preserving the
 * exact rule buildKnowledgeEdgeUpsertStatement applies on a (source_id, target_id, edge_type)
 * conflict: the row already there wins unless the incoming one is STRICTLY more confident,
 * and when the incoming one does win, the row already there is UPDATED in place — same id,
 * new judgment.
 *
 * Order matters. Self-loops go first, then each colliding canonical row absorbs the
 * duplicate's judgment if that judgment is better, then every duplicate row that now loses
 * (or always did) is dropped, and only what is left is re-pointed. By that last step no
 * collision can remain, so the reassignment cannot trip UNIQUE(source_id, target_id,
 * edge_type).
 */
export function buildMergeEdgeStatements(
  canonicalId: string,
  duplicateId: string,
): SqlTransactionStatement[] {
  return [
    // 1. Edges that would become self-loops once the duplicate becomes the canonical. The
    //    third pair covers a pre-existing duplicate->duplicate loop, which would otherwise
    //    survive the reassignment as canonical->canonical.
    {
      sql: `DELETE FROM knowledge_edges
             WHERE (source_id = ? AND target_id = ?)
                OR (source_id = ? AND target_id = ?)
                OR (source_id = ? AND target_id = ?)`,
      params: [duplicateId, canonicalId, canonicalId, duplicateId, duplicateId, duplicateId],
    },
    // 2. The canonical's row takes the duplicate's judgment when the duplicate's is strictly
    //    more confident — the upsert's DO UPDATE, expressed over the whole table at once.
    buildAbsorbStatement(canonicalId, duplicateId, "source_id"),
    buildAbsorbStatement(canonicalId, duplicateId, "target_id"),
    // 3. Every duplicate row that collides with a canonical row now loses (>= keeps the
    //    canonical's, exactly like `WHERE excluded.confidence > knowledge_edges.confidence`;
    //    after step 2 an absorbed row's confidence equals the duplicate's, so the duplicate
    //    goes here too).
    buildLoserDeleteStatement(canonicalId, duplicateId, "source_id"),
    buildLoserDeleteStatement(canonicalId, duplicateId, "target_id"),
    // 4. Whatever is left simply moves across.
    {
      sql: "UPDATE knowledge_edges SET source_id = ? WHERE source_id = ?",
      params: [canonicalId, duplicateId],
    },
    {
      sql: "UPDATE knowledge_edges SET target_id = ? WHERE target_id = ?",
      params: [canonicalId, duplicateId],
    },
  ];
}

/** The pinned endpoint's partner: for an outgoing edge the target must match, and the other
 * way round for an incoming one. */
function otherEndOf(pinned: "source_id" | "target_id"): "source_id" | "target_id" {
  return pinned === "source_id" ? "target_id" : "source_id";
}

/**
 * "The duplicate has a rival edge on the same key, and it is strictly more confident" — as a
 * correlated condition over the row currently being examined. Deliberately plain correlated
 * SQL rather than UPDATE...FROM: this batch must run identically on node:sqlite,
 * better-sqlite3, sqlite-wasm and the desktop's sqlx, and nothing else in this repository
 * relies on the newer syntax.
 */
function rivalCondition(pinned: "source_id" | "target_id"): string {
  const other = otherEndOf(pinned);
  return `rival.${pinned} = ?
            AND rival.${other} = knowledge_edges.${other}
            AND rival.edge_type = knowledge_edges.edge_type
            AND rival.confidence > knowledge_edges.confidence`;
}

/** The canonical's colliding row updated in place from the duplicate's better judgment. Every
 * SET expression reads the row's ORIGINAL values (SQL evaluates them all before any is
 * applied), so the six subqueries all agree on which rival they are copying. */
function buildAbsorbStatement(
  canonicalId: string,
  duplicateId: string,
  pinned: "source_id" | "target_id",
): SqlTransactionStatement {
  const rival = rivalCondition(pinned);
  const assignments = ABSORBED_COLUMNS.map(
    (column) => `${column} = (SELECT rival.${column} FROM knowledge_edges rival WHERE ${rival})`,
  ).join(",\n               ");
  return {
    sql: `UPDATE knowledge_edges
             SET ${assignments}
           WHERE ${pinned} = ?
             AND EXISTS (SELECT 1 FROM knowledge_edges rival WHERE ${rival})`,
    params: [...ABSORBED_COLUMNS.map(() => duplicateId), canonicalId, duplicateId],
  };
}

/** The duplicate's row dropped wherever the canonical's row is at least as confident. */
function buildLoserDeleteStatement(
  canonicalId: string,
  duplicateId: string,
  pinned: "source_id" | "target_id",
): SqlTransactionStatement {
  const other = otherEndOf(pinned);
  return {
    sql: `DELETE FROM knowledge_edges
           WHERE ${pinned} = ?
             AND EXISTS (SELECT 1 FROM knowledge_edges kept
                          WHERE kept.${pinned} = ?
                            AND kept.${other} = knowledge_edges.${other}
                            AND kept.edge_type = knowledge_edges.edge_type
                            AND kept.confidence >= knowledge_edges.confidence)`,
    params: [duplicateId, canonicalId],
  };
}
