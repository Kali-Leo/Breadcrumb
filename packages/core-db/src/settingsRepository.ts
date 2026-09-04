/**
 * Purpose: SQL statements for the settings table — the key/value store the host app keeps its
 * own preferences in (values are JSON-encoded by this repo, opaque to SQLite).
 * Main exports: createSettingsRepo factory.
 */
import { z } from "zod";
import type { SettingRow } from "./chatTypes";
import { parseJsonColumn } from "./jsonColumns";
import type { SqlClient } from "./types";

/** Settings values are opaque to this repo — each caller knows its own shape and validates
 * it there. All this layer promises is "valid JSON of some kind, or null". */
const AnyJsonSchema = z.unknown();

export function createSettingsRepo(sql: SqlClient) {
  return {
    /**
     * A stored row is external input like any other, so this goes through parseJsonColumn and
     * an unreadable `value_json` comes back as null — the caller falls back to its default,
     * exactly as it does for a key that was never written.
     *
     * A bare `JSON.parse` here used to throw instead, and this is the one read in the app that
     * cannot afford to: settingsStoreLoad's Promise.all, settingsStore.load and App.tsx's
     * startup IIFE all have no catch between them, so a single corrupt row (a bad disk write,
     * a hand-edited database) left `loaded` false forever — the app stopped on the loading
     * screen with no way back, and chat, diglot, knowledge and companion never initialized.
     */
    async get<Value>(key: string): Promise<Value | null> {
      const rows = await sql.select<SettingRow>("SELECT * FROM settings WHERE key = ?", [key]);
      const row = rows[0];
      if (row === undefined) return null;
      return parseJsonColumn(AnyJsonSchema, row.value_json) as Value | null;
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
