/**
 * Purpose: hand-written, append-only SQL migrations mirroring schema.ts.
 * Main exports: ALL_MIGRATIONS (ordered list), runMigrations(executor).
 * Rule: never edit a shipped migration — append a new one instead.
 */

export interface SqlExecutor {
  /** Executes a statement without reading rows (DDL, INSERT, UPDATE...). */
  execute(sql: string, params?: readonly unknown[]): Promise<void>;
}

export const ALL_MIGRATIONS: readonly string[] = [
  // 0001: initial tables
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);`,
  `CREATE TABLE IF NOT EXISTS llm_calls (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id),
    purpose TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_micros INTEGER NOT NULL,
    currency TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_llm_calls_created ON llm_calls(created_at);`,
];

export async function runMigrations(executor: SqlExecutor): Promise<void> {
  for (const statement of ALL_MIGRATIONS) {
    await executor.execute(statement);
  }
}
