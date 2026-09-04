/**
 * Purpose: the regression test that would have caught the 2026-08-27 production failure —
 * mergeNode running on a REAL SQLite database with foreign keys ON, against a duplicate node
 * that carries rows in every table referencing knowledge_nodes. Plus a schema-drift tripwire:
 * pragma_foreign_key_list is asked which tables reference knowledge_nodes, and the merge
 * statement batch must mention every one of them. A future migration that adds a referencing
 * table and forgets the merge executor fails here instead of in production.
 */
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { KnowledgeNodeRow } from "./knowledgeTypes";
import { runMigrations } from "./migrations";
import {
  createNodeMergeRepo,
  MERGE_NODE_ID_JSON_COLUMNS,
  MERGE_REFERENCING_TABLES,
} from "./nodeMergeRepository";
import { buildMergeNodeStatements } from "./nodeMergeStatements";
import { createNodeSqliteClient } from "./realSqliteTestFixture";
import type { SqlClient } from "./types";

const NOW = "2026-08-28T10:00:00.000Z";

interface ForeignKeyRow {
  table: string;
}

interface JsonColumnRow {
  table: string;
  column: string;
}

/** The batch as one blob of SQL, for the two tripwires that ask "does the merge mention
 * this?". Every statement is unconditional now — the edge and goal halves are always present
 * — so nothing has to be staged to make them appear. */
function mergeBatchText(): string {
  return buildMergeNodeStatements({
    canonicalId: "canonical",
    duplicateId: "duplicate",
    duplicateLabel: "l",
    duplicateSnapshot: null,
    mergeId: "merge-1",
    goals: [
      { id: "g1", title: "t", node_ids_json: '["duplicate"]', created_at: NOW, updated_at: NOW },
    ],
    nowIso: NOW,
  })
    .map((statement) => statement.sql)
    .join("\n");
}

/**
 * Every `*_json` column in the schema that does NOT hold knowledge node ids, with the reason
 * it cannot. This list plus MERGE_NODE_ID_JSON_COLUMNS must together account for every JSON
 * column the live schema has — that is the whole tripwire. A JSON column is opaque TEXT to
 * SQLite, so no pragma and no query can discover a node id inside one; the only mechanism
 * available is forcing a human to classify each new column, which is what failing here does.
 */
const NODE_ID_FREE_JSON_COLUMNS: readonly string[] = [
  "canonical_concept_embeddings.vector_json", // numbers
  "canonical_concepts.aliases_json", // label strings
  "companion_knowledge_state.state_json", // the teach-back student model, keyed by conversation
  "comparison_profile_items.aliases_json", // label strings
  "diglot_context_embeddings.vector_json", // numbers
  "diglot_language_packs.meta_json", // pack metadata
  "diglot_language_packs.payload_json", // the pack itself
  "diglot_word_states.fsrs_json", // a serialized FSRS card
  "factcheck_claims.evidence_json", // quoted source text
  "interest_signals.styles_json", // style labels
  "node_embeddings.vector_json", // numbers
  "node_merges.duplicate_snapshot_json", // deliberately frozen: the audit record OF a merge,
  // whose whole value is that it still describes the node as it was when it was deleted
  "research_results.display_json", // rendered research output
  "research_results.results_json", // rendered research output
  "settings.value_json", // host app preferences
  "term_marks.terms_json", // term strings
];

async function openForeignKeyEnforcingDatabase(): Promise<{ sql: SqlClient; close(): void }> {
  const db = new DatabaseSync(":memory:");
  // node:sqlite enables foreign keys by default; asserted here rather than assumed, because
  // the whole point of this file is that the three test hosts must agree with the real app.
  db.exec("PRAGMA foreign_keys = ON");
  const sql = createNodeSqliteClient(db);
  await runMigrations(sql);
  const [pragma] = db.prepare("PRAGMA foreign_keys").all() as { foreign_keys: number }[];
  if (pragma?.foreign_keys !== 1) throw new Error("foreign keys are not enforced in this fixture");
  return { sql, close: () => db.close() };
}

function node(id: string, label: string, createdAt: string): KnowledgeNodeRow {
  return {
    id,
    parent_id: null,
    label,
    summary: `${label} 的说明`,
    kind: "concept",
    created_at: createdAt,
  };
}

async function seedMergeScenario(sql: SqlClient): Promise<void> {
  await sql.execute(
    "INSERT INTO conversations (id, title, created_at, updated_at, kind, study_mode) VALUES (?, ?, ?, ?, 'chat', 0)",
    ["conv-1", "t", NOW, NOW],
  );
  for (const row of [
    node("canonical", "导数", "2026-08-01T09:00:00Z"),
    node("duplicate", "导数（derivative）", "2026-08-01T10:00:00Z"),
    node("child", "偏导数", "2026-08-01T11:00:00Z"),
  ]) {
    await sql.execute(
      "INSERT INTO knowledge_nodes (id, parent_id, label, summary, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        row.id,
        row.id === "child" ? "duplicate" : null,
        row.label,
        row.summary,
        row.kind,
        row.created_at,
      ],
    );
  }
  await sql.execute("INSERT INTO canonical_concepts VALUES (?, ?, ?, ?, ?)", [
    "concept-1",
    "导数",
    "[]",
    "某教材",
    NOW,
  ]);
  // The row that actually broke production: an anchor keyed (node_id, concept_id) whose FK
  // blocked the duplicate's deletion, so every merge rolled back.
  await sql.execute(
    "INSERT INTO node_concept_anchors (node_id, concept_id, verdict, confidence, method, reason, anchored_at) VALUES (?, ?, 'different', 'medium', 'judge', 'r', ?)",
    ["duplicate", "concept-1", NOW],
  );
  await sql.execute(
    "INSERT INTO node_sightings (id, node_id, conversation_id, message_id, created_at, origin_node_id) VALUES (?, ?, 'conv-1', NULL, ?, ?)",
    ["sight-1", "duplicate", NOW, null],
  );
  // A DIFFERENT node's sighting whose origin points at the duplicate — the silent, FK-less
  // dangling reference.
  await sql.execute(
    "INSERT INTO node_sightings (id, node_id, conversation_id, message_id, created_at, origin_node_id) VALUES (?, ?, 'conv-1', NULL, ?, ?)",
    ["sight-2", "canonical", NOW, "duplicate"],
  );
  await sql.execute("INSERT INTO map_place_names VALUES (?, ?, 'user', ?)", [
    "duplicate",
    "导数岛",
    NOW,
  ]);
  await sql.execute(
    "INSERT INTO companion_proposals (id, companion_id, node_id, topic, status, created_at, resolved_at, kind) VALUES (?, 'shichimi', ?, 't', 'pending', ?, NULL, 'teach')",
    ["proposal-1", "duplicate", NOW],
  );
  await sql.execute("INSERT INTO node_pair_verdicts VALUES (?, ?, 'different', ?)", [
    "canonical",
    "duplicate",
    NOW,
  ]);
  await sql.execute("INSERT INTO node_embeddings VALUES (?, 'test', '[1,0]', ?)", [
    "duplicate",
    NOW,
  ]);
  await sql.execute("INSERT INTO node_aliases VALUES (?, ?, ?)", ["旧别名", "duplicate", NOW]);
  await sql.execute(
    "INSERT INTO interest_signals (id, node_id, conversation_id, curiosity, confusion, boredom, styles_json, created_at, confidence) VALUES (?, ?, 'conv-1', 0.5, 0, 0, '[]', ?, 0.6)",
    ["signal-1", "duplicate", NOW],
  );
  await sql.execute(
    "INSERT INTO mastery_claims (id, node_id, level, source, created_at) VALUES (?, ?, 'learned', 'self-report', ?)",
    ["claim-1", "duplicate", NOW],
  );
}

describe("mergeNode against a foreign-key-enforcing database", () => {
  let database: { sql: SqlClient; close(): void } | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  it("completes a merge on a node that has rows in every referencing table", async () => {
    database = await openForeignKeyEnforcingDatabase();
    await seedMergeScenario(database.sql);

    await createNodeMergeRepo(database.sql).mergeNode(
      "canonical",
      "duplicate",
      "导数（derivative）",
      NOW,
      "merge-1",
    );

    const remaining = await database.sql.select<{ id: string }>(
      "SELECT id FROM knowledge_nodes ORDER BY id",
    );
    expect(remaining.map((row) => row.id)).toEqual(["canonical", "child"]);

    const child = await database.sql.select<{ parent_id: string | null }>(
      "SELECT parent_id FROM knowledge_nodes WHERE id = 'child'",
    );
    expect(child[0]?.parent_id).toBe("canonical");

    const sightings = await database.sql.select<{ node_id: string; origin_node_id: string | null }>(
      "SELECT node_id, origin_node_id FROM node_sightings ORDER BY id",
    );
    expect(sightings.map((row) => row.node_id)).toEqual(["canonical", "canonical"]);
    expect(sightings[1]?.origin_node_id).toBe("canonical");

    const anchors = await database.sql.select("SELECT * FROM node_concept_anchors");
    expect(anchors).toEqual([]); // deleted, not re-pointed: the key would collide and the
    // verdict was about the duplicate's label, not the canonical's

    const verdicts = await database.sql.select("SELECT * FROM node_pair_verdicts");
    expect(verdicts).toEqual([]);

    const proposals = await database.sql.select<{ node_id: string | null }>(
      "SELECT node_id FROM companion_proposals",
    );
    expect(proposals[0]?.node_id).toBe("canonical");

    const placeNames = await database.sql.select<{ node_id: string; custom_label: string }>(
      "SELECT node_id, custom_label FROM map_place_names",
    );
    expect(placeNames).toEqual([{ node_id: "canonical", custom_label: "导数岛" }]);

    const alias = await database.sql.select<{ node_id: string }>(
      "SELECT node_id FROM node_aliases WHERE alias_label = '旧别名'",
    );
    expect(alias[0]?.node_id).toBe("canonical");
  });

  it("keeps the canonical's own place name when both sides have one", async () => {
    database = await openForeignKeyEnforcingDatabase();
    await seedMergeScenario(database.sql);
    await database.sql.execute("INSERT INTO map_place_names VALUES (?, ?, 'user', ?)", [
      "canonical",
      "本名岛",
      NOW,
    ]);

    await createNodeMergeRepo(database.sql).mergeNode(
      "canonical",
      "duplicate",
      "导数（derivative）",
      NOW,
      "merge-1",
    );

    const placeNames = await database.sql.select<{ node_id: string; custom_label: string }>(
      "SELECT node_id, custom_label FROM map_place_names",
    );
    expect(placeNames).toEqual([{ node_id: "canonical", custom_label: "本名岛" }]);
  });

  it("snapshots the duplicate's whole row into node_merges before deleting it", async () => {
    database = await openForeignKeyEnforcingDatabase();
    await seedMergeScenario(database.sql);

    await createNodeMergeRepo(database.sql).mergeNode(
      "canonical",
      "duplicate",
      "导数（derivative）",
      NOW,
      "merge-1",
    );

    const merges = await createNodeMergeRepo(database.sql).listMerges();
    expect(merges).toHaveLength(1);
    expect(merges[0]?.canonical_id).toBe("canonical");
    expect(merges[0]?.duplicate_id).toBe("duplicate");
    const snapshot = JSON.parse(merges[0]?.duplicate_snapshot_json ?? "null") as KnowledgeNodeRow;
    expect(snapshot.label).toBe("导数（derivative）");
    expect(snapshot.summary).toBe("导数（derivative） 的说明");
    expect(snapshot.created_at).toBe("2026-08-01T10:00:00Z");
  });

  it("covers every table the live schema says references knowledge_nodes", async () => {
    database = await openForeignKeyEnforcingDatabase();
    const referencing = await database.sql.select<ForeignKeyRow>(
      `SELECT DISTINCT m.name AS "table"
       FROM sqlite_master m
       JOIN pragma_foreign_key_list(m.name) fk
       WHERE m.type = 'table' AND fk."table" = 'knowledge_nodes'`,
    );
    const tables = referencing.map((row) => row.table).sort();
    expect(tables.length).toBeGreaterThan(0);

    const batchText = mergeBatchText();

    for (const table of tables) {
      expect(
        MERGE_REFERENCING_TABLES.includes(table),
        `${table} references knowledge_nodes but is missing from MERGE_REFERENCING_TABLES`,
      ).toBe(true);
      expect(
        batchText.includes(table),
        `${table} references knowledge_nodes but mergeNode's statement batch never touches it`,
      ).toBe(true);
    }
    // The FK-less references the pragma cannot see are declared by hand; they must be in the
    // batch too, or a merge leaves silently dangling node ids behind.
    for (const table of MERGE_REFERENCING_TABLES) {
      expect(batchText.includes(table), `${table} is declared but absent from the batch`).toBe(
        true,
      );
    }
  });

  it("accounts for every JSON column that could be hiding node ids", async () => {
    database = await openForeignKeyEnforcingDatabase();
    const columns = await database.sql.select<JsonColumnRow>(
      `SELECT m.name AS "table", p.name AS "column"
         FROM sqlite_master m JOIN pragma_table_info(m.name) p
        WHERE m.type = 'table' AND p.name LIKE '%_json'
        ORDER BY m.name, p.name`,
    );
    expect(columns.length).toBeGreaterThan(0);

    const classified = new Set([...MERGE_NODE_ID_JSON_COLUMNS, ...NODE_ID_FREE_JSON_COLUMNS]);
    for (const { table, column } of columns) {
      expect(
        classified.has(`${table}.${column}`),
        `${table}.${column} is a JSON column nobody has classified. SQLite cannot tell whether ` +
          "it holds knowledge node ids, so say so by hand: add it to MERGE_NODE_ID_JSON_COLUMNS " +
          "and rewrite it in the merge batch, or to NODE_ID_FREE_JSON_COLUMNS with the reason.",
      ).toBe(true);
    }

    // Nothing classified as node-id-bearing may be missing from the batch, and nothing may be
    // classified twice.
    const batchText = mergeBatchText();
    for (const declared of MERGE_NODE_ID_JSON_COLUMNS) {
      const [table, column] = declared.split(".");
      expect(NODE_ID_FREE_JSON_COLUMNS).not.toContain(declared);
      expect(
        table !== undefined && column !== undefined,
        `${declared} must be written as table.column`,
      ).toBe(true);
      expect(
        batchText.includes(`UPDATE ${table}`) && batchText.includes(`${column} = ?`),
        `${declared} holds node ids but the merge batch never rewrites it`,
      ).toBe(true);
    }
  });
});
