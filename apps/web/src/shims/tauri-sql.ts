/**
 * Purpose: stands in for @tauri-apps/plugin-sql in the browser build. Vite aliases that module
 * to this one, so apps/desktop's data layer — every migration, every hand-written query —
 * runs unchanged against SQLite compiled to WebAssembly.
 *
 * The desktop app deliberately never calls the plugin's `load`; Rust opens the one database
 * this app owns and the frontend gets a handle by key. `Database.get` is therefore the only
 * entry point that has to exist here, and there is no path by which a caller could name a
 * file — the same property the desktop build enforces through its capability set.
 * Main exports: Database (default-shaped).
 */
import { openBrowserDatabase } from "./sqlite";

/** Mirrors the shape apps/desktop/src/lib/db.ts uses: `select`, `execute`, and nothing else. */
class BrowserDatabaseHandle {
  async select<Row>(sql: string, params: unknown[] = []): Promise<Row> {
    const database = await openBrowserDatabase();
    return (await database.select(sql, params)) as Row;
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ rowsAffected: number }> {
    const database = await openBrowserDatabase();
    await database.execute(sql, params);
    // Nothing in the app reads this figure; it exists so the shape matches the plugin's.
    return { rowsAffected: 0 };
  }
}

const handle = new BrowserDatabaseHandle();

const Database = {
  /** The key is opaque on both builds — it names the app's own database, never a path. */
  async get(_key: string): Promise<BrowserDatabaseHandle> {
    await openBrowserDatabase();
    return handle;
  },
  async load(_key: string): Promise<BrowserDatabaseHandle> {
    await openBrowserDatabase();
    return handle;
  },
};

export default Database;
export { Database };
