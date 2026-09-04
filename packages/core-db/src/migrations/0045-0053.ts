/**
 * Purpose: shipped migrations 0045-0053. Part of the append-only MIGRATIONS list
 * assembled in ./index.ts — see that file for the rules.
 * 0045-0053 — dedup bookkeeping, canonical concept embeddings, the anchor-confidence
 * rebuild, edge provenance, llm_calls indexing and columns, the diglot pack payload, the
 * dead-table/index housekeeping drop, and the parent-link repair.
 * Main exports: MIGRATIONS_0045_0053.
 */
import type { Migration } from "./migration";

export const MIGRATIONS_0045_0053: readonly Migration[] = [
  {
    // Design audit 2026-08-28 (知识图谱与去重 #3 and #5): the dedup sweep's two missing
    // memories. node_merges snapshots the whole duplicate row before mergeNode deletes it, so
    // a wrong merge is auditable and undoable (until now the duplicate's summary, created_at
    // and history vanished with no record at all). node_pair_verdicts caches the "different"
    // verdicts too — before this, only "same" produced a node_aliases row, so the same top-10
    // suspect pairs were re-sent to the LLM on every single startup, forever.
    // Deliberately NO foreign keys on either table: both reference node ids that the merge
    // executor is in the middle of deleting, and a FK here would reintroduce exactly the
    // constraint failure this audit round is fixing.
    id: "0045_dedup_bookkeeping",
    statements: [
      `CREATE TABLE node_merges (
        id TEXT PRIMARY KEY,
        canonical_id TEXT NOT NULL,
        duplicate_id TEXT NOT NULL,
        duplicate_snapshot_json TEXT NOT NULL,
        merged_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_node_merges_canonical ON node_merges(canonical_id);`,
      `CREATE TABLE node_pair_verdicts (
        node_a_id TEXT NOT NULL,
        node_b_id TEXT NOT NULL,
        verdict TEXT NOT NULL CHECK (verdict IN ('same','different')),
        judged_at TEXT NOT NULL,
        PRIMARY KEY (node_a_id, node_b_id)
      );`,
    ],
  },
  {
    // Design audit 2026-08-28 (知识图谱与去重 #2, 数据层 B8): every anchor sweep re-embedded all
    // ~800 canonical concepts from scratch because there was nowhere to keep the vectors.
    // content_hash is the hash of the exact text that was embedded, so a refreshed concept
    // (new aliases, new label) invalidates just its own row instead of the whole cache.
    id: "0046_canonical_concept_embeddings",
    statements: [
      `CREATE TABLE canonical_concept_embeddings (
        concept_id TEXT PRIMARY KEY REFERENCES canonical_concepts(id),
        content_hash TEXT NOT NULL,
        vector_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
    ],
  },
  {
    // Design audit 2026-08-28 (多语言 B6): the alignment judge's confidence tier was stored as
    // 高/中/低 — Chinese literals inside a JSON contract the model is separately instructed to
    // answer in the learner's own language, which makes the enum fight the language directive.
    // The tier becomes ASCII; existing rows map across. SQLite CHECK constraints cannot be
    // altered, so the table is rebuilt (same shape as 0027's mastery_claims rebuild).
    id: "0047_ascii_alignment_confidence",
    statements: [
      `ALTER TABLE node_concept_anchors RENAME TO node_concept_anchors_old;`,
      `CREATE TABLE node_concept_anchors (
        node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
        concept_id TEXT NOT NULL REFERENCES canonical_concepts(id),
        verdict TEXT NOT NULL CHECK (verdict IN ('same','different')),
        confidence TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
        method TEXT NOT NULL CHECK (method IN ('alias','judge')),
        reason TEXT NOT NULL,
        anchored_at TEXT NOT NULL,
        PRIMARY KEY (node_id, concept_id)
      );`,
      `INSERT INTO node_concept_anchors
         (node_id, concept_id, verdict, confidence, method, reason, anchored_at)
       SELECT node_id, concept_id, verdict,
         CASE confidence
           WHEN '高' THEN 'high'
           WHEN '中' THEN 'medium'
           WHEN '低' THEN 'low'
           ELSE 'medium'
         END,
         method, reason, anchored_at
       FROM node_concept_anchors_old;`,
      `DROP TABLE node_concept_anchors_old;`,
      `CREATE INDEX idx_node_concept_anchors_node ON node_concept_anchors(node_id);`,
    ],
  },
  {
    // Design audit 2026-08-28 (知识图谱与去重 #6): the edge judge is asked for a reasoning
    // sentence, the schema parses it, and it was then thrown away — the cheapest possible
    // hallucination defence (an auditable trail) cost one column that did not exist.
    // source_message_id records which assistant reply the round's nodes came from, so an edge
    // can be traced back to the text that produced it. Both NULL for every pre-0048 edge.
    id: "0048_edge_reasoning_provenance",
    statements: [
      `ALTER TABLE knowledge_edges ADD COLUMN reasoning TEXT;`,
      `ALTER TABLE knowledge_edges ADD COLUMN source_message_id TEXT;`,
    ],
  },
  {
    // Design audit 2026-08-28 (数据层与性能 #9): llm_calls is the fastest-growing table in the
    // schema (1535 rows and climbing on the dev database) and sumCostForConversation filters it
    // by conversation_id, which had no index — a full scan on every metering read. The audit
    // named four other unindexed foreign-key columns and judged all four not worth an index:
    // their tables are small enough that the scan is cheaper than the write cost of maintaining
    // one. Do not add them without new evidence.
    id: "0049_llm_calls_conversation_index",
    statements: [
      `CREATE INDEX IF NOT EXISTS idx_llm_calls_conversation ON llm_calls(conversation_id);`,
    ],
  },
  {
    // Providers that keep a prefix cache bill a cache hit at roughly 1/30 of a fresh read
    // (DeepSeek v4-flash: ¥0.10 vs ¥3.00 per million at peak). The client used to drop the
    // split the API reports, so every input token was billed as a miss and the spending page
    // over-stated long conversations badly. Recording the hit count makes the ledger right
    // and makes the prefix cache's actual hit rate visible instead of guessed at.
    id: "0050_llm_calls_cached_input_tokens",
    statements: [`ALTER TABLE llm_calls ADD COLUMN cached_input_tokens INTEGER;`],
  },
  {
    // Language packs beyond the bundled zh→en are downloaded when the learner picks a pair
    // (2026-09-01): dozens of pairs at a megabyte or two each cannot all ride inside the
    // installer. The payload lives here rather than on disk so the browser build, which has
    // no filesystem, installs packs the same way the desktop does — one code path, and the
    // pack disappears with the database it belongs to.
    id: "0051_diglot_pack_payload",
    statements: [`ALTER TABLE diglot_language_packs ADD COLUMN payload_json TEXT;`],
  },
  {
    // Housekeeping (dead-code audit 2026-09-02). practice_attestations was superseded by
    // practice_scores in 0022, which copied its rows across and then deliberately left the
    // old table standing; nothing has read or written it since, so it goes now. The two
    // indexes cost every insert and serve no query: factcheck_runs is only ever read by
    // conversation_id, and node_merges has no WHERE clause anywhere.
    id: "0052_drop_dead_table_and_indexes",
    statements: [
      `DROP TABLE IF EXISTS practice_attestations;`,
      `DROP INDEX IF EXISTS idx_factcheck_runs_message;`,
      `DROP INDEX IF EXISTS idx_node_merges_canonical;`,
    ],
  },
  {
    // A one-shot repair for knowledge_nodes.parent_id, the column whose corruption is
    // invisible: a foreign key cannot express "and not in a cycle", and feature-map's
    // indexChildren silently drops any node it cannot reach from a root, so a bad parent link
    // does not throw — it deletes a branch of the map in the learner's eyes.
    //
    // Two sources, both real. (a) Until 2026-09-04 a merge whose duplicate was an ANCESTOR of
    // its canonical re-pointed the duplicate's children onto the canonical and closed a loop;
    // the canonical and everything under it disappeared. nodeMergeStatements.ts's cycle guard
    // stops new ones, but databases that already merged carry the loop. (b) A parent_id
    // pointing at a row that no longer exists — reachable on any host that ever ran with
    // foreign keys off, and left behind by hand-edited databases.
    //
    // Why this is a NEW migration and not a fix inside 0003_user_level_tree, which is where
    // parent_id trouble first appeared: 0003 shipped, and every database that ran it recorded
    // it in _migrations and will never run it again. Editing it would change what a FRESH
    // database gets while leaving every existing one untouched — the two would drift apart
    // permanently, with no error to say so. An append-only list is only trustworthy if the
    // entries behind you are frozen. (Note this therefore does NOT rescue a database still
    // stuck AT 0003: if 0003 itself aborts, the runner never reaches this migration. See the
    // 0003 comment.)
    //
    // Cycle members are flattened to roots rather than re-parented, because there is no
    // honest place to put them: the loop destroyed the information about where they belonged.
    // A root is visible and correctable; an invisible node is neither. The depth bound is
    // orders of magnitude past any real tree and exists only so an already-cyclic database
    // cannot make the recursive walk run forever.
    id: "0053_repair_knowledge_node_parents",
    statements: [
      `UPDATE knowledge_nodes SET parent_id = NULL
        WHERE parent_id IS NOT NULL
          AND parent_id NOT IN (SELECT id FROM knowledge_nodes);`,
      `WITH RECURSIVE ancestor_chain(start_id, node_id, depth) AS (
         SELECT id, parent_id, 1 FROM knowledge_nodes WHERE parent_id IS NOT NULL
         UNION ALL
         SELECT c.start_id, n.parent_id, c.depth + 1
           FROM ancestor_chain c JOIN knowledge_nodes n ON n.id = c.node_id
          WHERE c.node_id <> c.start_id AND n.parent_id IS NOT NULL AND c.depth < 1000
       )
       UPDATE knowledge_nodes SET parent_id = NULL
        WHERE id IN (SELECT start_id FROM ancestor_chain WHERE node_id = start_id);`,
    ],
  },
];
