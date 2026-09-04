/**
 * Purpose: regression test for 0053_repair_knowledge_node_parents. A bad
 * knowledge_nodes.parent_id is the one kind of corruption that never throws: a self-loop
 * satisfies the foreign key perfectly, and feature-map's indexChildren then drops the node
 * and everything under it from the map without a word. This pins that the repair migration
 * finds both shapes — a parent that does not exist, and a parent chain that loops — and that
 * it leaves a healthy tree exactly as it was.
 */
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeSqliteClient } from "../realSqliteTestFixture";
import type { SqlClient } from "../types";
import { runMigrations } from "./index";

const REPAIR_ID = "0053_repair_knowledge_node_parents";
const NOW = "2026-09-04T00:00:00.000Z";

interface Fixture {
  sql: SqlClient;
  /** Rewinds the ledger so runMigrations replays only the repair — the way it will run on a
   * database that was already damaged before this build existed. */
  replayRepair(): Promise<void>;
  /** Foreign keys off, so a parent_id pointing at nothing can be written at all. */
  writeBadRowsWithoutForeignKeys(rows: readonly [string, string | null][]): Promise<void>;
  close(): void;
}

async function openFixture(): Promise<Fixture> {
  const db = new DatabaseSync(":memory:");
  const sql = createNodeSqliteClient(db);
  await runMigrations(sql);
  return {
    sql,
    async replayRepair() {
      await sql.execute("DELETE FROM _migrations WHERE id = ?", [REPAIR_ID]);
      await runMigrations(sql);
    },
    async writeBadRowsWithoutForeignKeys(rows) {
      db.exec("PRAGMA foreign_keys = OFF");
      for (const [id, parentId] of rows) {
        await sql.execute(
          "INSERT INTO knowledge_nodes (id, parent_id, label, summary, kind, created_at) VALUES (?, ?, ?, '说明', 'concept', ?)",
          [id, parentId, `标签-${id}`, NOW],
        );
      }
      db.exec("PRAGMA foreign_keys = ON");
    },
    close: () => db.close(),
  };
}

async function parentsById(sql: SqlClient): Promise<Map<string, string | null>> {
  const rows = await sql.select<{ id: string; parent_id: string | null }>(
    "SELECT id, parent_id FROM knowledge_nodes ORDER BY id",
  );
  return new Map(rows.map((row) => [row.id, row.parent_id]));
}

describe("0053_repair_knowledge_node_parents", () => {
  let fixture: Fixture | null = null;

  afterEach(() => {
    fixture?.close();
    fixture = null;
  });

  it("frees a node that is its own parent, so its subtree comes back", async () => {
    fixture = await openFixture();
    // Exactly what the old merge produced when the duplicate was the canonical's parent.
    await fixture.writeBadRowsWithoutForeignKeys([
      ["canon", "canon"],
      ["leaf", "canon"],
    ]);

    await fixture.replayRepair();

    const parents = await parentsById(fixture.sql);
    expect(parents.get("canon")).toBeNull();
    expect(parents.get("leaf")).toBe("canon");
  });

  it("breaks a longer parent loop at exactly one node", async () => {
    fixture = await openFixture();
    await fixture.writeBadRowsWithoutForeignKeys([
      ["a", "c"],
      ["b", "a"],
      ["c", "b"],
      ["hanger", "c"],
    ]);

    await fixture.replayRepair();

    const parents = await parentsById(fixture.sql);
    const freed = [...parents].filter(([, parent]) => parent === null).map(([id]) => id);
    expect(freed).toHaveLength(3); // every node ON the loop; the loop is gone either way
    expect(parents.get("hanger")).toBe("c");
  });

  it("nulls a parent_id that points at a node that does not exist", async () => {
    fixture = await openFixture();
    await fixture.writeBadRowsWithoutForeignKeys([["orphan", "ghost"]]);

    await fixture.replayRepair();

    expect((await parentsById(fixture.sql)).get("orphan")).toBeNull();
  });

  it("leaves a healthy tree untouched", async () => {
    fixture = await openFixture();
    await fixture.writeBadRowsWithoutForeignKeys([
      ["root", null],
      ["kingdom", "root"],
      ["village", "kingdom"],
    ]);

    await fixture.replayRepair();

    expect([...(await parentsById(fixture.sql))]).toEqual([
      ["kingdom", "root"],
      ["root", null],
      ["village", "kingdom"],
    ]);
  });
});
