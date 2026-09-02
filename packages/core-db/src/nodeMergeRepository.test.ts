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
import { createNodeMergeRepo, MERGE_REFERENCING_TABLES } from "./nodeMergeRepository";
import { buildMergeNodeStatements } from "./nodeMergeStatements";
import { createNodeSqliteClient } from "./realSqliteTestFixture";
import type { SqlClient } from "./types";

const NOW = "2026-08-28T10:00:00.000Z";

interface ForeignKeyRow {
  table: string;
}

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

    const statements = buildMergeNodeStatements({
      canonicalId: "canonical",
      duplicateId: "duplicate",
      duplicateLabel: "l",
      duplicateSnapshot: null,
      mergeId: "merge-1",
      // One touched edge, so the edge remove/upsert statements are present in the batch this
      // tripwire inspects — with no edges those statements legitimately do not appear.
      touchedEdges: [
        {
          id: "edge-1",
          source_id: "duplicate",
          target_id: "other",
          edge_type: "helps",
          weight: 0.6,
          confidence: 0.7,
          origin: "llm",
          created_at: NOW,
        },
      ],
      nowIso: NOW,
    });
    const batchText = statements.map((statement) => statement.sql).join("\n");

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
});
