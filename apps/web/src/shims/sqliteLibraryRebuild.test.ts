/**
 * Purpose: migration 0059 rebuilds a table two others reference, with foreign keys on, inside
 * one transaction — the one shape of migration in this list that can lose data quietly. So it
 * is run here on real SQLite against a library with rows in every table, and what is checked
 * is what a reader would lose: the passages, the vectors, the cascade from a deleted
 * document, and the foreign keys pointing at the new table rather than the renamed one.
 */
import { MIGRATIONS, type SqlClient } from "@breadcrumb/core-db";
import { beforeAll, describe, expect, it } from "vitest";
import { execRows, execRun, openMemoryDatabase } from "./sqliteTypes";

const REBUILD = "0059_library_image_documents";
let client: SqlClient;

async function apply(id: string): Promise<void> {
  const migration = MIGRATIONS.find((candidate) => candidate.id === id);
  if (migration === undefined) throw new Error(`no migration ${id}`);
  await client.executeTransaction(migration.statements.map((sql) => ({ sql })));
}

beforeAll(async () => {
  const handle = await openMemoryDatabase();
  execRun(handle, "PRAGMA foreign_keys = ON;");
  client = {
    select: async <Row>(sql: string, params?: readonly unknown[]) =>
      execRows<Row>(handle, sql, params ?? []),
    execute: async (sql: string, params?: readonly unknown[]) => {
      execRun(handle, sql, params ?? []);
    },
    executeTransaction: async (statements) => {
      execRun(handle, "BEGIN;");
      try {
        for (const statement of statements) execRun(handle, statement.sql, statement.params ?? []);
        execRun(handle, "COMMIT;");
      } catch (error) {
        execRun(handle, "ROLLBACK;");
        throw error;
      }
    },
  };
  // Everything before the rebuild, then a library as an earlier build would have left it.
  for (const migration of MIGRATIONS) {
    if (migration.id === REBUILD) break;
    await apply(migration.id);
  }
  await client.execute(
    `INSERT INTO library_documents (id, title, origin, media_type, language, passage_count, created_at)
     VALUES ('doc', '复利入门', 'upload', 'pdf', 'zh-CN', 2, '2026-01-01')`,
  );
  await client.execute(
    `INSERT INTO library_passages (id, document_id, parent_id, ordinal, heading_path, body, token_estimate, created_at)
     VALUES ('doc_p0', 'doc', NULL, 0, '复利入门', '七十二法则。', 5, '2026-01-01'),
            ('doc_p0_c0', 'doc', 'doc_p0', 0, '复利入门', '七十二法则。', 5, '2026-01-01')`,
  );
  await client.execute(
    `INSERT INTO library_passage_embeddings (passage_id, model, vector_json, created_at)
     VALUES ('doc_p0_c0', 'gte-multilingual-base-int8-384', '[0.6,0.8]', '2026-01-01')`,
  );
  await client.execute(
    `INSERT INTO library_passage_fts (passage_id, body, stems) VALUES ('doc_p0_c0', '七十 十二', '')`,
  );
  await apply(REBUILD);
}, 60_000);

const count = async (table: string): Promise<number> => {
  const [row] = await client.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`, []);
  return row?.n ?? -1;
};

describe("rebuilding library_documents under its children", () => {
  it("keeps every row of every table", async () => {
    expect(await count("library_documents")).toBe(1);
    expect(await count("library_passages")).toBe(2);
    expect(await count("library_passage_embeddings")).toBe(1);
    expect(await count("library_passage_fts")).toBe(1);
  });

  it("leaves no renamed table behind and points the foreign keys at the new ones", async () => {
    const tables = await client.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'library_%'",
      [],
    );
    expect(tables.map((row) => row.name).some((name) => name.endsWith("_old"))).toBe(false);
    const passageKeys = await client.select<{ table: string }>(
      "PRAGMA foreign_key_list(library_passages)",
      [],
    );
    expect(new Set(passageKeys.map((key) => key.table))).toEqual(
      new Set(["library_documents", "library_passages"]),
    );
    const embeddingKeys = await client.select<{ table: string }>(
      "PRAGMA foreign_key_list(library_passage_embeddings)",
      [],
    );
    expect(embeddingKeys.map((key) => key.table)).toEqual(["library_passages"]);
    const indexes = await client.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'library_%'",
      [],
    );
    expect(indexes.map((row) => row.name).sort()).toEqual([
      "library_passage_embeddings_by_model",
      "library_passages_by_document",
      "library_passages_by_parent",
    ]);
  });

  it("accepts an image document, which is what the rebuild was for", async () => {
    await client.execute(
      `INSERT INTO library_documents (id, title, origin, media_type, language, passage_count, created_at)
       VALUES ('photo', '板书', 'upload', 'image', 'zh-CN', 0, '2026-01-02')`,
    );
    await expect(
      client.execute(
        `INSERT INTO library_documents (id, title, origin, media_type, language, passage_count, created_at)
         VALUES ('bad', 'x', 'upload', 'audio', 'zh-CN', 0, '2026-01-02')`,
      ),
    ).rejects.toThrow();
  });

  it("still cascades a deleted document through its passages and vectors", async () => {
    await client.execute("DELETE FROM library_documents WHERE id = 'doc'");
    expect(await count("library_passages")).toBe(0);
    expect(await count("library_passage_embeddings")).toBe(0);
  });
});
