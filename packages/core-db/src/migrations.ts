/**
 * Purpose: versioned, append-only SQL migrations with exactly-once tracking via the
 * _migrations table. Never edit a shipped migration — append a new one.
 * Main exports: MIGRATIONS, runMigrations.
 */
import type { SqlClient } from "./types";

export interface Migration {
  /** Stable id, ordered lexicographically, e.g. "0003_user_level_tree". */
  id: string;
  statements: readonly string[];
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: "0001_initial",
    statements: [
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);`,
      `CREATE TABLE IF NOT EXISTS llm_calls (
        id TEXT PRIMARY KEY,
        conversation_id TEXT REFERENCES conversations(id),
        purpose TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        cost_micros INTEGER NOT NULL,
        currency TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_llm_calls_created ON llm_calls(created_at);`,
    ],
  },
  {
    id: "0002_knowledge_and_trail",
    statements: [
      `CREATE TABLE IF NOT EXISTS knowledge_nodes (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        parent_id TEXT REFERENCES knowledge_nodes(id),
        label TEXT NOT NULL,
        summary TEXT NOT NULL,
        source_message_id TEXT REFERENCES messages(id),
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_conversation ON knowledge_nodes(conversation_id);`,
      `CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_created ON knowledge_nodes(created_at);`,
      `CREATE TABLE IF NOT EXISTS trail_summaries (
        date TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
    ],
  },
  {
    // The tree becomes a USER attribute: nodes are globally unique by label;
    // conversations leave sightings (footprints) instead of owning nodes.
    id: "0003_user_level_tree",
    statements: [
      `CREATE TABLE knowledge_nodes_v2 (
        id TEXT PRIMARY KEY,
        parent_id TEXT REFERENCES knowledge_nodes_v2(id),
        label TEXT NOT NULL UNIQUE,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      // Earliest node of each label survives as the canonical one.
      `INSERT OR IGNORE INTO knowledge_nodes_v2 (id, parent_id, label, summary, created_at)
       SELECT id, parent_id, label, summary, created_at FROM knowledge_nodes ORDER BY created_at ASC, id ASC;`,
      // Parents that were deduplicated away are re-pointed to the surviving same-label node.
      `UPDATE knowledge_nodes_v2 SET parent_id = (
         SELECT v2.id FROM knowledge_nodes old
         JOIN knowledge_nodes_v2 v2 ON v2.label = old.label
         WHERE old.id = knowledge_nodes_v2.parent_id
       ) WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM knowledge_nodes_v2);`,
      `CREATE TABLE node_sightings (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL REFERENCES knowledge_nodes_v2(id),
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        message_id TEXT REFERENCES messages(id),
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_node_sightings_conversation ON node_sightings(conversation_id);`,
      `CREATE INDEX idx_node_sightings_node ON node_sightings(node_id);`,
      // Every legacy per-conversation node becomes one sighting of its canonical node.
      `INSERT INTO node_sightings (id, node_id, conversation_id, message_id, created_at)
       SELECT old.id || '-s', v2.id, old.conversation_id, old.source_message_id, old.created_at
       FROM knowledge_nodes old JOIN knowledge_nodes_v2 v2 ON v2.label = old.label;`,
      `DROP TABLE knowledge_nodes;`,
      `ALTER TABLE knowledge_nodes_v2 RENAME TO knowledge_nodes;`,
      `CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_created ON knowledge_nodes(created_at);`,
    ],
  },
  {
    // Locally-computed embedding per knowledge node — the map's spatial raw material.
    id: "0004_node_embeddings",
    statements: [
      `CREATE TABLE node_embeddings (
        node_id TEXT PRIMARY KEY REFERENCES knowledge_nodes(id),
        model TEXT NOT NULL,
        vector_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
    ],
  },
  {
    // Memory-palace place-name overrides: renaming an island never rewrites the
    // knowledge concept itself. source 'user' always outranks 'ai'.
    id: "0005_map_place_names",
    statements: [
      `CREATE TABLE map_place_names (
        node_id TEXT PRIMARY KEY REFERENCES knowledge_nodes(id),
        custom_label TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('user','ai')),
        updated_at TEXT NOT NULL
      );`,
    ],
  },
  {
    // Fact-check results per assistant message: one run holds gentle per-claim verdicts
    // with their verified evidence (spec 009). Renumbered from 0005_factcheck at merge
    // time; safe because no local database had applied the old id yet.
    id: "0006_factcheck",
    statements: [
      `CREATE TABLE factcheck_runs (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id),
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_factcheck_runs_message ON factcheck_runs(message_id);`,
      `CREATE INDEX idx_factcheck_runs_conversation ON factcheck_runs(conversation_id);`,
      `CREATE TABLE factcheck_claims (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES factcheck_runs(id),
        claim_text TEXT NOT NULL,
        relationship TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_factcheck_claims_run ON factcheck_claims(run_id);`,
    ],
  },
  {
    // Directed learning-structure edges over the tree (spec 010): 'requires' (hard
    // prerequisite, weight always 1) and 'helps' (weighted aid, weight 0~1). Learning
    // methods become first-class nodes via the new 'kind' column, linked by 'helps' edges.
    id: "0007_knowledge_edges",
    statements: [
      `ALTER TABLE knowledge_nodes ADD COLUMN kind TEXT NOT NULL DEFAULT 'concept';`,
      `CREATE TABLE knowledge_edges (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
        target_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
        edge_type TEXT NOT NULL CHECK (edge_type IN ('requires','helps')),
        weight REAL NOT NULL,
        confidence REAL NOT NULL,
        origin TEXT NOT NULL CHECK (origin IN ('llm','user')),
        created_at TEXT NOT NULL,
        UNIQUE (source_id, target_id, edge_type)
      );`,
      `CREATE INDEX idx_knowledge_edges_source ON knowledge_edges(source_id);`,
      `CREATE INDEX idx_knowledge_edges_target ON knowledge_edges(target_id);`,
    ],
  },
  {
    // Two independent evidence streams for the mastery/interest split (spec 011, ADR-0009):
    // interest_signals is per-round LLM-observed psychological signal, mastery_claims is
    // user self-report. Neither table is read by the other's computation.
    id: "0008_interest_and_claims",
    statements: [
      `CREATE TABLE interest_signals (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        curiosity REAL NOT NULL,
        confusion REAL NOT NULL,
        boredom REAL NOT NULL,
        styles_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_interest_signals_node ON interest_signals(node_id);`,
      `CREATE INDEX idx_interest_signals_created ON interest_signals(created_at);`,
      `CREATE TABLE mastery_claims (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
        level TEXT NOT NULL CHECK (level IN ('learned','familiar')),
        source TEXT NOT NULL CHECK (source IN ('self-report')),
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_mastery_claims_node ON mastery_claims(node_id);`,
    ],
  },
  {
    // Learning goals set up in the experimental lab panel (spec 012): a title plus the node
    // ids it maps to (LLM-assisted, user-calibrated). gapAndPath() recomputes routes for a
    // goal from its node_ids_json on every read — nothing here is a stored plan.
    id: "0009_goals",
    statements: [
      `CREATE TABLE goals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        node_ids_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_goals_updated ON goals(updated_at);`,
    ],
  },
  {
    // Developer-visible record of silent AI pipeline degradation (spec 014): every store's
    // extraction/judging catch writes one best-effort row here — never surfaced to the user,
    // only to the lab panel's "最近的静默失败" section.
    id: "0010_ai_failures",
    statements: [
      `CREATE TABLE ai_failures (
        id TEXT PRIMARY KEY,
        purpose TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX idx_ai_failures_created ON ai_failures(created_at);`,
    ],
  },
];

/** Applies every migration not yet recorded in _migrations, oldest first, exactly once. */
export async function runMigrations(sql: SqlClient): Promise<void> {
  await sql.execute(
    "CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  // Repair a legacy id: factcheck first shipped as 0005_factcheck and was renumbered to
  // 0006_factcheck when 0005_map_place_names merged ahead of it. Databases migrated under
  // the old id would otherwise re-run the migration and abort on existing tables.
  await sql.execute(
    `UPDATE _migrations SET id = '0006_factcheck'
     WHERE id = '0005_factcheck'
       AND NOT EXISTS (SELECT 1 FROM _migrations WHERE id = '0006_factcheck')`,
  );
  const appliedRows = await sql.select<{ id: string }>("SELECT id FROM _migrations");
  const applied = new Set(appliedRows.map((row) => row.id));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    for (const statement of migration.statements) {
      await sql.execute(statement);
    }
    await sql.execute("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)", [
      migration.id,
      new Date().toISOString(),
    ]);
  }
}
