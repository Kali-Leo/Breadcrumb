/**
 * Purpose: real-SQLite regression tests for the better-sqlite3 SqlClient adapter — the
 * legacy 0005_factcheck -> 0006_factcheck migration-id repair, knowledge_edges' upsert
 * "keep higher confidence" ON CONFLICT semantics, and the self-title ladder state table
 * (migration 0016, spec 021) — all against a real database file instead of the fakes
 * core-db's own tests use.
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

describe("goal_ladder_state (real sqlite, migration 0016)", () => {
  it("drops every board table and round-trips the slim per-goal state row", async () => {
    temp = await createTempDatabase();
    const now = "2026-08-05T10:00:00.000Z";
    await temp.repos.goals.insert({
      id: "goal1",
      title: "学微积分",
      node_ids_json: "[]",
      created_at: now,
      updated_at: now,
    });

    // Every board/people table from earlier ladder designs must be gone — selecting raises.
    for (const dropped of [
      "goal_ladders",
      "ladder_shown_descriptions",
      "goal_ladders_v2",
      "ladder_shown_identities",
      "goal_ladder_figures",
    ]) {
      await expect(temp.sql.select(`SELECT * FROM ${dropped}`, [])).rejects.toThrow(
        /no such table/,
      );
    }

    // The state table carries only the four spec 021 columns — the dropped board-lifecycle
    // columns must not linger after the rebuild+rename migration.
    const columns = await temp.sql.select<{ name: string }>(
      "SELECT name FROM pragma_table_info('goal_ladder_state')",
      [],
    );
    expect(columns.map((column) => column.name).sort()).toEqual([
      "goal_id",
      "last_shown_rank",
      "last_view_fuel",
      "updated_at",
    ]);

    expect(await temp.repos.goalLadders.getState("goal1")).toBeNull();
    await temp.repos.goalLadders.upsertState({
      goal_id: "goal1",
      last_shown_rank: 120_431,
      last_view_fuel: 4.5,
      updated_at: now,
    });
    await temp.repos.goalLadders.upsertState({
      goal_id: "goal1",
      last_shown_rank: 99_120,
      last_view_fuel: 9.1,
      updated_at: now,
    });
    const state = await temp.repos.goalLadders.getState("goal1");
    expect(state?.last_shown_rank).toBe(99_120);
    expect(state?.last_view_fuel).toBe(9.1);
  });
});
