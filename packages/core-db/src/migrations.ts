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
];

/** Applies every migration not yet recorded in _migrations, oldest first, exactly once. */
export async function runMigrations(sql: SqlClient): Promise<void> {
  await sql.execute(
    "CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
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
