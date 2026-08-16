/**
 * Purpose: real-SQLite regression tests for the better-sqlite3 SqlClient adapter — the
 * executeTransaction all-or-nothing rollback contract, the
 * legacy 0005_factcheck -> 0006_factcheck migration-id repair, knowledge_edges' upsert
 * "keep higher confidence" ON CONFLICT semantics, the comparison tree's whole-replace
 * profile/item tables
 * (migration 0018, spec 023), the dropped item-scoped alignment table (migration 0019, spec
 * 024, dropped again by migration 0020), and the canonical-concept crosswalk's node<->concept
 * anchor tables (migration 0020, spec 025), and occupation profiles / practice attestations /
 * practice-kind conversations (migration 0021, spec 026) — all against a real database file
 * instead of the fakes core-db's own tests use.
 */
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "@breadcrumb/core-db";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteClient, createTempDatabase, type TempDatabase } from "./sqliteClient";

const openHandles: Database.Database[] = [];
const openPaths: string[] = [];
let temp: TempDatabase | null = null;

afterEach(() => {
  temp?.close();
  temp = null;
  for (const db of openHandles.splice(0)) db.close();
  for (const path of openPaths.splice(0)) {
    if (existsSync(path)) unlinkSync(path);
  }
});

function openRawTempDatabase(): { db: Database.Database; path: string } {
  const path = join(tmpdir(), `breadcrumb-simlab-test-${randomUUID()}.sqlite`);
  const db = new Database(path);
  openHandles.push(db);
  openPaths.push(path);
  return { db, path };
}

describe("createTempDatabase", () => {
  it("opens a migrated, ready-to-use database", async () => {
    temp = await createTempDatabase();
    expect(existsSync(temp.path)).toBe(true);
    const nodes = await temp.repos.knowledgeNodes.listAll();
    expect(nodes).toEqual([]);
  });
});

describe("executeTransaction atomicity (real sqlite)", () => {
  it("rolls the whole batch back when a middle statement fails — no partial rows", async () => {
    temp = await createTempDatabase();
    const now = "2026-08-15T10:00:00.000Z";

    await expect(
      temp.sql.executeTransaction([
        {
          sql: "INSERT INTO ai_failures (id, purpose, message, created_at) VALUES (?, ?, ?, ?)",
          params: ["f1", "test", "first row", now],
        },
        // Violates knowledge_nodes' NOT NULL label constraint — must abort the batch.
        {
          sql: "INSERT INTO knowledge_nodes (id, parent_id, label, summary, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          params: ["n1", null, null, "s", "concept", now],
        },
        {
          sql: "INSERT INTO ai_failures (id, purpose, message, created_at) VALUES (?, ?, ?, ?)",
          params: ["f2", "test", "second row", now],
        },
      ]),
    ).rejects.toThrow(/NOT NULL/);

    // Statement 1 ran before the failure, statement 3 never ran — atomicity means BOTH are
    // absent afterwards, not just the ones after the failure point.
    expect(await temp.sql.select("SELECT * FROM ai_failures", [])).toEqual([]);
    expect(await temp.sql.select("SELECT * FROM knowledge_nodes", [])).toEqual([]);
  });

  it("persists every statement of a successful batch", async () => {
    temp = await createTempDatabase();
    const now = "2026-08-15T10:00:00.000Z";
    await temp.sql.executeTransaction([
      {
        sql: "INSERT INTO ai_failures (id, purpose, message, created_at) VALUES (?, ?, ?, ?)",
        params: ["f1", "test", "first row", now],
      },
      {
        sql: "INSERT INTO ai_failures (id, purpose, message, created_at) VALUES (?, ?, ?, ?)",
        params: ["f2", "test", "second row", now],
      },
    ]);
    expect(await temp.sql.select("SELECT id FROM ai_failures ORDER BY id", [])).toEqual([
      { id: "f1" },
      { id: "f2" },
    ]);
  });
});

describe("runMigrations legacy id repair (real sqlite)", () => {
  it("repairs a database migrated under the old 0005_factcheck id without re-running it", async () => {
    const { db } = openRawTempDatabase();
    const sql = createSqliteClient(db);

    await runMigrations(sql);
    const afterFirstRun = await sql.select<{ id: string }>(
      "SELECT id FROM _migrations WHERE id = '0006_factcheck'",
    );
    expect(afterFirstRun).toHaveLength(1);

    // Simulate a database that migrated under the pre-merge id.
    db.prepare("UPDATE _migrations SET id = '0005_factcheck' WHERE id = '0006_factcheck'").run();
    const legacyRow = await sql.select<{ id: string }>(
      "SELECT id FROM _migrations WHERE id = '0005_factcheck'",
    );
    expect(legacyRow).toHaveLength(1);

    // Re-running must complete without a "table already exists" error and must land back
    // on 0006_factcheck, not re-apply the migration's CREATE TABLE statements.
    await expect(runMigrations(sql)).resolves.toBeUndefined();

    const repaired = await sql.select<{ id: string }>(
      "SELECT id FROM _migrations WHERE id = '0006_factcheck'",
    );
    expect(repaired).toHaveLength(1);
    const stillLegacy = await sql.select<{ id: string }>(
      "SELECT id FROM _migrations WHERE id = '0005_factcheck'",
    );
    expect(stillLegacy).toHaveLength(0);
  });
});

describe("knowledge_edges upsert (real sqlite ON CONFLICT semantics)", () => {
  it("keeps the higher-confidence judgment on conflict and never downgrades", async () => {
    temp = await createTempDatabase();
    const now = "2026-08-01T10:00:00.000Z";
    await temp.repos.knowledgeNodes.insert({
      id: "n1",
      parent_id: null,
      label: "A",
      summary: "s",
      kind: "concept",
      created_at: now,
    });
    await temp.repos.knowledgeNodes.insert({
      id: "n2",
      parent_id: null,
      label: "B",
      summary: "s",
      kind: "concept",
      created_at: now,
    });

    await temp.repos.knowledgeEdges.upsert({
      id: "e1",
      source_id: "n1",
      target_id: "n2",
      edge_type: "requires",
      weight: 1,
      confidence: 0.9,
      origin: "llm",
      created_at: now,
    });

    // A lower-confidence re-judgment must not downgrade the stored edge.
    await temp.repos.knowledgeEdges.upsert({
      id: "e2",
      source_id: "n1",
      target_id: "n2",
      edge_type: "requires",
      weight: 1,
      confidence: 0.5,
      origin: "llm",
      created_at: now,
    });
    let edges = await temp.repos.knowledgeEdges.listAll();
    expect(edges).toHaveLength(1);
    expect(edges[0]?.confidence).toBe(0.9);
    expect(edges[0]?.id).toBe("e1");

    // A higher-confidence re-judgment must win.
    await temp.repos.knowledgeEdges.upsert({
      id: "e3",
      source_id: "n1",
      target_id: "n2",
      edge_type: "requires",
      weight: 1,
      confidence: 0.97,
      origin: "user",
      created_at: now,
    });
    edges = await temp.repos.knowledgeEdges.listAll();
    expect(edges).toHaveLength(1);
    expect(edges[0]?.confidence).toBe(0.97);
    // The UPDATE SET clause never touches `id` — the row keeps its original primary key even
    // as its content columns are overwritten by the higher-confidence judgment.
    expect(edges[0]?.id).toBe("e1");
    expect(edges[0]?.origin).toBe("user");
  });
});

describe("ladder teardown (real sqlite, migration 0024)", () => {
  it("leaves no ladder table behind after a full migration run", async () => {
    temp = await createTempDatabase();

    // The ladder module was removed by product decision (2026-08-12). Every table any of its
    // design generations ever created must be absent from a freshly migrated database.
    for (const dropped of [
      "goal_ladders",
      "ladder_shown_descriptions",
      "goal_ladders_v2",
      "ladder_shown_identities",
      "goal_ladder_figures",
      "goal_ladder_state",
      "goal_ladder_board",
      "goal_title_ladder",
    ]) {
      await expect(temp.sql.select(`SELECT * FROM ${dropped}`, [])).rejects.toThrow(
        /no such table/,
      );
    }
  });
});

describe("comparison_profiles (real sqlite, migration 0018)", () => {
  it("round-trips a profile tree, overwrites it on replace, and clears it on delete", async () => {
    temp = await createTempDatabase();
    const now = "2026-08-09T10:00:00.000Z";

    await temp.repos.comparisons.replaceProfile(
      {
        id: "profile1",
        title: "计算机科学本科课程",
        origin: "searched",
        description: "某校计算机科学系公开的本科培养方案",
        source_note: "https://example.edu/cs-curriculum",
        created_at: now,
        category: "curriculum",
      },
      [
        {
          id: "item1",
          profile_id: "profile1",
          parent_id: null,
          label: "数据结构",
          aliases_json: "[]",
          source_ref: "https://example.edu/cs-curriculum#ds",
          position: 0,
          concept_id: null,
          item_kind: "knowledge",
        },
        {
          id: "item2",
          profile_id: "profile1",
          parent_id: null,
          label: "操作系统",
          aliases_json: "[]",
          source_ref: "https://example.edu/cs-curriculum#os",
          position: 1,
          concept_id: null,
          item_kind: "knowledge",
        },
        {
          id: "item3",
          profile_id: "profile1",
          parent_id: "item2",
          label: "进程调度",
          aliases_json: "[]",
          source_ref: "https://example.edu/cs-curriculum#os-scheduling",
          position: 2,
          concept_id: null,
          item_kind: "knowledge",
        },
      ],
    );

    const storedProfile = await temp.repos.comparisons.getProfile("profile1");
    expect(storedProfile?.title).toBe("计算机科学本科课程");
    const storedItems = await temp.repos.comparisons.listItems("profile1");
    expect(storedItems.map((row) => row.label)).toEqual(["数据结构", "操作系统", "进程调度"]);
    expect(storedItems[2]?.parent_id).toBe("item2");

    // replaceProfile with a different item set overwrites the previous tree entirely.
    await temp.repos.comparisons.replaceProfile(
      {
        id: "profile1",
        title: "计算机科学本科课程（修订版）",
        origin: "searched",
        description: "某校计算机科学系公开的本科培养方案",
        source_note: "https://example.edu/cs-curriculum",
        created_at: now,
        category: "curriculum",
      },
      [
        {
          id: "item9",
          profile_id: "profile1",
          parent_id: null,
          label: "编译原理",
          aliases_json: "[]",
          source_ref: "https://example.edu/cs-curriculum#compilers",
          position: 0,
          concept_id: null,
          item_kind: "knowledge",
        },
      ],
    );
    const afterReplace = await temp.repos.comparisons.listItems("profile1");
    expect(afterReplace).toHaveLength(1);
    expect(afterReplace[0]?.label).toBe("编译原理");
    expect((await temp.repos.comparisons.getProfile("profile1"))?.title).toBe(
      "计算机科学本科课程（修订版）",
    );

    await temp.repos.comparisons.deleteProfile("profile1");
    expect(await temp.repos.comparisons.getProfile("profile1")).toBeNull();
    expect(await temp.repos.comparisons.listItems("profile1")).toEqual([]);
  });
});

describe("comparison_alignments dropped (real sqlite, migration 0020)", () => {
  it("no longer exists — the crosswalk moved to node_concept_anchors", async () => {
    temp = await createTempDatabase();
    await expect(temp.sql.select("SELECT * FROM comparison_alignments", [])).rejects.toThrow(
      /no such table/,
    );
  });
});

describe("canonical_concepts + node_concept_anchors (real sqlite, migration 0020)", () => {
  it("round-trips concepts and anchors, overwrites on re-anchor, and accepts item concept_id", async () => {
    temp = await createTempDatabase();
    const now = "2026-08-09T10:00:00.000Z";

    await temp.repos.canonical.upsertConcepts([
      {
        id: "concept-data-structures",
        label: "数据结构",
        aliases_json: "[]",
        source_ref: "https://example.edu/cs-curriculum#ds",
        created_at: now,
      },
      {
        id: "concept-operating-systems",
        label: "操作系统",
        aliases_json: "[]",
        source_ref: "https://example.edu/cs-curriculum#os",
        created_at: now,
      },
    ]);
    const concepts = await temp.repos.canonical.listConcepts();
    expect(concepts.map((row) => row.id)).toEqual([
      "concept-data-structures",
      "concept-operating-systems",
    ]);

    await temp.repos.knowledgeNodes.insert({
      id: "node1",
      parent_id: null,
      label: "数据结构",
      summary: "常见数据结构",
      kind: "concept",
      created_at: now,
    });

    await temp.repos.canonical.upsertAnchors([
      {
        node_id: "node1",
        concept_id: "concept-data-structures",
        verdict: "same",
        confidence: "高",
        method: "alias",
        reason: "标签完全一致",
        anchored_at: "2026-08-09T11:00:00.000Z",
      },
    ]);
    const anchors = await temp.repos.canonical.listAnchors();
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.verdict).toBe("same");
    expect(anchors[0]?.method).toBe("alias");

    // PRIMARY KEY (node_id, concept_id) overwrite semantics: re-anchoring the same pair
    // replaces it in place rather than accumulating a second row.
    await temp.repos.canonical.upsertAnchors([
      {
        node_id: "node1",
        concept_id: "concept-data-structures",
        verdict: "different",
        confidence: "中",
        method: "judge",
        reason: "重新判定为不同概念",
        anchored_at: "2026-08-09T12:00:00.000Z",
      },
    ]);
    const afterReanchor = await temp.repos.canonical.listAnchors();
    expect(afterReanchor).toHaveLength(1);
    expect(afterReanchor[0]?.verdict).toBe("different");
    expect(afterReanchor[0]?.confidence).toBe("中");
    expect(afterReanchor[0]?.method).toBe("judge");

    // comparison_profile_items now carries an optional concept_id column.
    await temp.repos.comparisons.replaceProfile(
      {
        id: "profile1",
        title: "计算机科学本科课程",
        origin: "searched",
        description: "某校计算机科学系公开的本科培养方案",
        source_note: "https://example.edu/cs-curriculum",
        created_at: now,
        category: "curriculum",
      },
      [
        {
          id: "item1",
          profile_id: "profile1",
          parent_id: null,
          label: "数据结构",
          aliases_json: "[]",
          source_ref: "https://example.edu/cs-curriculum#ds",
          position: 0,
          concept_id: "concept-data-structures",
          item_kind: "knowledge",
        },
      ],
    );
    const items = await temp.repos.comparisons.listItems("profile1");
    expect(items[0]?.concept_id).toBe("concept-data-structures");
  });
});

describe("occupation profiles + practice scores + practice conversations (real sqlite, migrations 0021/0022)", () => {
  it("round-trips an occupation profile with a practice item, overwrites a score, and round-trips a practice-kind conversation", async () => {
    temp = await createTempDatabase();
    const now = "2026-08-10T10:00:00.000Z";

    await temp.repos.comparisons.replaceProfile(
      {
        id: "profile-occ1",
        title: "前端工程师·某人",
        origin: "searched",
        description: "一位真人前端工程师的自述职业画像",
        source_note: "用户自述",
        created_at: now,
        category: "occupation",
      },
      [
        {
          id: "item-occ1",
          profile_id: "profile-occ1",
          parent_id: null,
          label: "独立完成过一个生产级 React 项目",
          aliases_json: "[]",
          source_ref: "用户自述",
          position: 0,
          concept_id: null,
          item_kind: "practice",
        },
      ],
    );
    const storedProfile = await temp.repos.comparisons.getProfile("profile-occ1");
    expect(storedProfile?.category).toBe("occupation");
    const storedItems = await temp.repos.comparisons.listItems("profile-occ1");
    expect(storedItems[0]?.item_kind).toBe("practice");

    // Score upsert (spec 029): 10, then overwritten to 5 rather than accumulating a row.
    expect(await temp.repos.practice.listScores()).toEqual([]);
    await temp.repos.practice.upsertScore({
      item_id: "item-occ1",
      score: 10,
      scored_at: now,
    });
    let scores = await temp.repos.practice.listScores();
    expect(scores).toEqual([{ item_id: "item-occ1", score: 10, scored_at: now }]);

    const later = "2026-08-10T11:00:00.000Z";
    await temp.repos.practice.upsertScore({
      item_id: "item-occ1",
      score: 5,
      scored_at: later,
    });
    scores = await temp.repos.practice.listScores();
    expect(scores).toEqual([{ item_id: "item-occ1", score: 5, scored_at: later }]);

    // A practice-kind conversation is saved but excluded from the 'chat' sidebar listing.
    await temp.repos.conversations.create({
      id: "conv-chat1",
      title: "普通对话",
      created_at: now,
      updated_at: now,
      kind: "chat",
    });
    await temp.repos.conversations.create({
      id: "conv-practice1",
      title: "关于「独立完成过一个生产级 React 项目」的讨论",
      created_at: now,
      updated_at: now,
      kind: "practice",
    });
    const chatOnly = await temp.repos.conversations.listByKind("chat");
    expect(chatOnly.map((row) => row.id)).toEqual(["conv-chat1"]);
    const all = await temp.repos.conversations.listRecentFirst();
    expect(all.map((row) => row.id).sort()).toEqual(["conv-chat1", "conv-practice1"]);
  });

  it("defaults category/item_kind/kind for rows written before migration 0021's columns existed", async () => {
    temp = await createTempDatabase();
    const now = "2026-08-10T10:00:00.000Z";

    // Simulates a pre-migration write: only the columns that existed before spec 026.
    await temp.sql.execute(
      `INSERT INTO comparison_profiles (id, title, origin, description, source_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ["profile-legacy", "legacy", "builtin", "d", "s", now],
    );
    await temp.sql.execute(
      `INSERT INTO comparison_profile_items
         (id, profile_id, parent_id, label, aliases_json, source_ref, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ["item-legacy", "profile-legacy", null, "l", "[]", "s", 0],
    );
    await temp.sql.execute(
      "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
      ["conv-legacy", "t", now, now],
    );

    const profile = await temp.repos.comparisons.getProfile("profile-legacy");
    expect(profile?.category).toBe("curriculum");
    const items = await temp.repos.comparisons.listItems("profile-legacy");
    expect(items[0]?.item_kind).toBe("knowledge");
    const conversations = await temp.repos.conversations.listRecentFirst();
    expect(conversations.find((row) => row.id === "conv-legacy")?.kind).toBe("chat");
  });
});
