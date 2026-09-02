/**
 * Purpose: proves the browser edition's database really is the same database. The desktop
 * build runs every migration in MIGRATIONS through sqlx; this runs that same array through
 * SQLite-compiled-to-WebAssembly and then exercises the repositories against it. The count is
 * asserted against MIGRATIONS.length rather than written down here, because a number in a
 * comment goes stale the first time someone adds a migration.
 *
 * This is the browser edition's biggest risk in one test. Everything else it does is aliasing
 * a module; this is a different SQLite build, a different driver, and a different binding
 * layer underneath thousands of lines of hand-written SQL. A dialect difference here would
 * not show up until someone lost data.
 */
import { createSettingsRepo, MIGRATIONS, runMigrations, type SqlClient } from "@breadcrumb/core-db";
import { beforeAll, describe, expect, it } from "vitest";
import { execRows, execRun, openMemoryDatabase } from "./sqliteTypes";

let client: SqlClient;

beforeAll(async () => {
  // In memory: OPFS is browser-only, and what is under test is the SQL, not the storage.
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
        for (const statement of statements) {
          execRun(handle, statement.sql, statement.params ?? []);
        }
        execRun(handle, "COMMIT;");
      } catch (error) {
        execRun(handle, "ROLLBACK;");
        throw error;
      }
    },
  };
}, 60_000);

describe("the schema on SQLite-wasm", () => {
  it("applies every migration the desktop build applies", async () => {
    await runMigrations(client);
    const applied = await client.select<{ id: string }>("SELECT id FROM _migrations", []);
    expect(applied.length).toBe(MIGRATIONS.length);
  });

  it("is idempotent, so a reopened tab does not re-run anything", async () => {
    await runMigrations(client);
    const applied = await client.select<{ id: string }>("SELECT id FROM _migrations", []);
    expect(applied.length).toBe(MIGRATIONS.length);
  });

  it("created the tables the app actually reads and writes", async () => {
    const rows = await client.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
      [],
    );
    const tables = new Set(rows.map((row) => row.name));
    for (const table of [
      "conversations",
      "messages",
      "knowledge_nodes",
      "node_sightings",
      "knowledge_edges",
      "llm_calls",
      "settings",
    ]) {
      expect(tables.has(table), `${table} is missing`).toBe(true);
    }
  });

  it("carries this session's own new column, so the ledger can bill cache hits", async () => {
    const columns = await client.select<{ name: string }>("PRAGMA table_info(llm_calls)", []);
    expect(columns.map((column) => column.name)).toContain("cached_input_tokens");
  });

  it("round-trips through a real repository, not just raw SQL", async () => {
    const settings = createSettingsRepo(client);
    await settings.set("browserEditionProbe", { hello: "世界" }, new Date().toISOString());
    expect(await settings.get<{ hello: string }>("browserEditionProbe")).toEqual({ hello: "世界" });
  });

  it("enforces foreign keys, which the schema depends on", async () => {
    // SQLite names the column after the pragma itself.
    const [row] = await client.select<{ foreign_keys: number }>("PRAGMA foreign_keys", []);
    expect(row?.foreign_keys).toBe(1);
  });
});
