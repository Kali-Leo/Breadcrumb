/**
 * Purpose: regression tests for wipeDemoData's two failures — a delete list that had drifted
 * behind the schema (`map_place_names` has a real foreign key to knowledge_nodes, and naming
 * one demo island on the map was enough to make the wipe throw), and the absence of a
 * transaction, which turned that throw into a database nobody could recover: every demo
 * conversation, message and sighting gone, all 39 demo nodes still standing, and
 * insertDemoData — which begins by calling the wipe — permanently unable to run again.
 * Plus the schema-drift tripwire, the same shape MERGE_REFERENCING_TABLES got.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SqlClient, SqlTransactionStatement } from "@breadcrumb/core-db";
import {
  DEMO_PAIR,
  insertDemoData,
  WIPE_DEMO_REFERENCING_TABLES,
  wipeDemoData,
} from "@breadcrumb/demo-seed";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDatabase, type TempDatabase } from "../db/sqliteClient";

const PACK: unknown = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../apps/desktop/src/assets/language-packs/zh-en.json",
    ),
    "utf-8",
  ),
);
const NOW = new Date(2026, 7, 13, 9, 0, 0);

async function countRows(temp: TempDatabase, sql: string): Promise<number> {
  const rows = await temp.sql.select<{ n: number }>(sql);
  return rows[0]?.n ?? 0;
}

describe("wipeDemoData (real sqlite)", () => {
  let temp: TempDatabase | null = null;

  afterEach(() => {
    temp?.close();
    temp = null;
  });

  it("removes the demo even after the map has named one of its islands", async () => {
    temp = await createTempDatabase();
    await insertDemoData(temp.sql, NOW, { languagePack: PACK });
    const [firstNode] = await temp.sql.select<{ id: string }>(
      "SELECT id FROM knowledge_nodes WHERE id LIKE 'demo-%' ORDER BY id LIMIT 1",
    );
    expect(firstNode?.id).toBeDefined();
    await temp.sql.execute("INSERT INTO map_place_names VALUES (?, ?, 'user', ?)", [
      firstNode?.id,
      "我的岛",
      NOW.toISOString(),
    ]);
    // The FK-less strays the wipe also has to clean up, or they end up pointing at nothing.
    await temp.sql.execute("INSERT INTO node_pair_verdicts VALUES (?, ?, 'different', ?)", [
      firstNode?.id,
      "not-a-demo-node",
      NOW.toISOString(),
    ]);

    await expect(wipeDemoData(temp.sql)).resolves.toBeUndefined();

    expect(await countRows(temp, "SELECT COUNT(*) n FROM knowledge_nodes")).toBe(0);
    expect(await countRows(temp, "SELECT COUNT(*) n FROM map_place_names")).toBe(0);
    expect(await countRows(temp, "SELECT COUNT(*) n FROM node_pair_verdicts")).toBe(0);
    expect(await countRows(temp, "SELECT COUNT(*) n FROM conversations")).toBe(0);
    expect(await countRows(temp, `SELECT COUNT(*) n FROM diglot_word_states`)).toBe(0);
    expect(await countRows(temp, `SELECT COUNT(*) n FROM diglot_language_packs`)).toBe(0);
    expect(DEMO_PAIR).toBeTruthy();
  });

  it("rolls the whole wipe back when one delete fails, instead of half-erasing the database", async () => {
    temp = await createTempDatabase();
    await insertDemoData(temp.sql, NOW, { languagePack: PACK });
    const conversationsBefore = await countRows(temp, "SELECT COUNT(*) n FROM conversations");
    const messagesBefore = await countRows(temp, "SELECT COUNT(*) n FROM messages");
    const nodesBefore = await countRows(temp, "SELECT COUNT(*) n FROM knowledge_nodes");
    // Stands in for the next migration that adds a referencing table and forgets this list —
    // which is exactly what map_place_names was.
    await temp.sql.execute(
      "CREATE TABLE zz_future_table (id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES knowledge_nodes(id))",
    );
    const [firstNode] = await temp.sql.select<{ id: string }>(
      "SELECT id FROM knowledge_nodes ORDER BY id LIMIT 1",
    );
    await temp.sql.execute("INSERT INTO zz_future_table VALUES ('z1', ?)", [firstNode?.id]);

    await expect(wipeDemoData(temp.sql)).rejects.toThrow();

    expect(await countRows(temp, "SELECT COUNT(*) n FROM conversations")).toBe(conversationsBefore);
    expect(await countRows(temp, "SELECT COUNT(*) n FROM messages")).toBe(messagesBefore);
    expect(await countRows(temp, "SELECT COUNT(*) n FROM knowledge_nodes")).toBe(nodesBefore);
  });

  it("covers every table the live schema says references demo nodes or conversations", async () => {
    temp = await createTempDatabase();
    const referencing = await temp.sql.select<{ table: string }>(
      `SELECT DISTINCT m.name AS "table"
         FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) fk
        WHERE m.type = 'table' AND fk."table" IN ('knowledge_nodes', 'conversations')`,
    );
    expect(referencing.length).toBeGreaterThan(0);

    const batch = await recordWipeStatements();
    const batchText = batch.map((statement) => statement.sql).join("\n");
    for (const { table } of referencing) {
      expect(
        WIPE_DEMO_REFERENCING_TABLES.includes(table),
        `${table} references demo rows but is missing from WIPE_DEMO_REFERENCING_TABLES`,
      ).toBe(true);
      expect(
        batchText.includes(table),
        `${table} references demo rows but wipeDemoData never deletes from it`,
      ).toBe(true);
    }
    // The FK-less references the pragma cannot see are declared by hand; they must be in the
    // batch too, or the wipe leaves rows pointing at nodes it deleted.
    for (const table of WIPE_DEMO_REFERENCING_TABLES) {
      expect(batchText.includes(table), `${table} is declared but absent from the wipe`).toBe(true);
    }
  });

  it("issues the whole wipe as ONE transaction", async () => {
    const batch = await recordWipeStatements();
    expect(batch.length).toBeGreaterThan(10);
  });
});

/** Runs the wipe against a client that only records, so the statements can be inspected as
 * text — and so "did it use executeTransaction, or a stream of executes?" is answerable. */
async function recordWipeStatements(): Promise<readonly SqlTransactionStatement[]> {
  let batch: readonly SqlTransactionStatement[] | null = null;
  const recorder: SqlClient = {
    async select() {
      return [];
    },
    async execute() {
      throw new Error("wipeDemoData must issue every delete inside one transaction");
    },
    async executeTransaction(statements) {
      if (batch !== null) throw new Error("wipeDemoData must use exactly one transaction");
      batch = statements;
    },
  };
  await wipeDemoData(recorder);
  if (batch === null) throw new Error("wipeDemoData issued no transaction");
  return batch;
}
