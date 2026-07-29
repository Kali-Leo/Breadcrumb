/**
 * Purpose: public entry of the data layer — creates a Drizzle database over an injected
 * SQL backend (Tauri sql plugin in the app; any executor in tests).
 * Main exports: createDatabase(), BreadcrumbDatabase, schema tables, migration helpers.
 */
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

export { ALL_MIGRATIONS, runMigrations, type SqlExecutor } from "./migrations";
export * from "./schema";

/** Rows-returning query backend the host app must provide (e.g. tauri-plugin-sql). */
export interface SqlBackend {
  /** Runs a SELECT and returns rows as arrays of column values (Drizzle proxy format). */
  select(sql: string, params: readonly unknown[]): Promise<unknown[][]>;
  /** Runs a mutating statement (INSERT/UPDATE/DELETE/DDL). */
  execute(sql: string, params: readonly unknown[]): Promise<void>;
}

export type BreadcrumbDatabase = ReturnType<typeof createDatabase>;

export function createDatabase(backend: SqlBackend) {
  return drizzle(
    async (sql, params, method) => {
      if (method === "run") {
        await backend.execute(sql, params);
        return { rows: [] };
      }
      const rows = await backend.select(sql, params);
      if (method === "get") {
        return { rows: rows[0] ?? [] };
      }
      return { rows };
    },
    { schema },
  );
}
