/**
 * Purpose: SQL statements for the settings table — the key/value store the host app keeps its
 * own preferences in (values are JSON-encoded by this repo, opaque to SQLite).
 * Main exports: createSettingsRepo factory.
 */
import type { SettingRow } from "./chatTypes";
import type { SqlClient } from "./types";

export function createSettingsRepo(sql: SqlClient) {
  return {
    async get<Value>(key: string): Promise<Value | null> {
      const rows = await sql.select<SettingRow>("SELECT * FROM settings WHERE key = ?", [key]);
      const row = rows[0];
      return row ? (JSON.parse(row.value_json) as Value) : null;
    },
    async set(key: string, value: unknown, nowIso: string): Promise<void> {
      await sql.execute(
        `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
        [key, JSON.stringify(value), nowIso],
      );
    },
  };
}
