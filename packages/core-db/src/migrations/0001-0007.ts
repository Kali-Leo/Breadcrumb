/**
 * Purpose: shipped migrations 0001-0007. Part of the append-only MIGRATIONS list
 * assembled in ./index.ts — see that file for the rules.
 * 0001-0007 — the original schema: settings/conversations/messages/llm_calls, the
 * knowledge tree and its sightings, node embeddings, map place names, factcheck and the
 * first knowledge edges.
 * Main exports: MIGRATIONS_0001_0007.
 */
import type { Migration } from "./migration";

export const MIGRATIONS_0001_0007: readonly Migration[] = [
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
    //
    // KNOWN DEFECT, deliberately left as it shipped: the `INSERT OR IGNORE` below drops every
    // later row sharing a label, and if a dropped row was ANOTHER row's parent, the child it
    // left behind fails the foreign key at the end of that statement — 0003 aborts and the
    // database can never move past it. (The re-pointing UPDATE that would have fixed the
    // parent runs after, so it never gets the chance.) Only 0002-era databases with a
    // duplicated label whose row is a parent are affected, which per-conversation trees made
    // ordinary.
    //
    // It is not fixed here because these statements are frozen: every database that ran 0003
    // recorded it and will never run it again, so editing this list changes only what FRESH
    // databases get and silently forks the two schemas apart. 0053 repairs the parent links a
    // surviving database can still be carrying; a database stuck AT 0003 cannot be rescued by
    // any later migration and needs a hand repair of the old knowledge_nodes table first.
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
];
