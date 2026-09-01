/**
 * Purpose: deleting a conversation, against a real migrated database — the cascade has to
 * leave no foreign key pointing at a deleted row, and has to leave alone the two things that
 * outlive the conversation: the learner's knowledge nodes and the money already spent.
 */
import { describe, expect, it } from "vitest";
import { openMigratedDatabase } from "./realSqliteTestFixture";
import { createConversationsRepo } from "./repositories";

const NOW = "2026-09-01T10:00:00.000Z";

async function seedConversation(sql: Awaited<ReturnType<typeof openMigratedDatabase>>["sql"]) {
  await sql.execute(
    "INSERT INTO conversations (id, title, created_at, updated_at, kind) VALUES (?,?,?,?,?)",
    ["conv-1", "闭包", NOW, NOW, "chat"],
  );
  await sql.execute(
    "INSERT INTO conversations (id, title, created_at, updated_at, kind) VALUES (?,?,?,?,?)",
    ["conv-2", "另一段", NOW, NOW, "chat"],
  );
  for (const [id, conversation] of [
    ["msg-1", "conv-1"],
    ["msg-2", "conv-1"],
    ["msg-3", "conv-2"],
  ] as const) {
    await sql.execute(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?,?,?,?,?)",
      [id, conversation, "user", "…", NOW],
    );
  }
  await sql.execute(
    "INSERT INTO knowledge_nodes (id, parent_id, label, summary, created_at, kind) VALUES (?,?,?,?,?,?)",
    ["node-1", null, "闭包", "", NOW, "concept"],
  );
  // A footprint from each conversation: the deleted one goes, the other stays.
  await sql.execute(
    "INSERT INTO node_sightings (id, node_id, conversation_id, message_id, created_at, grade) VALUES (?,?,?,?,?,?)",
    ["sight-1", "node-1", "conv-1", "msg-1", NOW, "good"],
  );
  await sql.execute(
    "INSERT INTO node_sightings (id, node_id, conversation_id, message_id, created_at, grade) VALUES (?,?,?,?,?,?)",
    ["sight-2", "node-1", "conv-2", "msg-3", NOW, "good"],
  );
  await sql.execute(
    `INSERT INTO focus_sessions (id, conversation_id, entry_message_id, root_label, created_at, updated_at)
     VALUES (?,?,?,?,?,?)`,
    ["focus-1", "conv-1", "msg-1", "闭包", NOW, NOW],
  );
  await sql.execute(
    "INSERT INTO focus_nodes (id, session_id, parent_id, kind, label, answer_text, created_at) VALUES (?,?,?,?,?,?,?)",
    ["focus-node-1", "focus-1", null, "word", "闭包", "…", NOW],
  );
  await sql.execute(
    "INSERT INTO term_marks (id, target_kind, target_id, terms_json, created_at) VALUES (?,?,?,?,?)",
    ["mark-1", "message", "msg-1", "[]", NOW],
  );
  await sql.execute(
    `INSERT INTO llm_calls (id, conversation_id, purpose, model, input_tokens, output_tokens, cost_micros, currency, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    ["call-1", "conv-1", "chat", "m", 10, 20, 500, "CNY", NOW],
  );
}

async function count(
  sql: Awaited<ReturnType<typeof openMigratedDatabase>>["sql"],
  table: string,
  where = "",
): Promise<number> {
  const rows = await sql.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} ${where}`);
  return rows[0]?.n ?? 0;
}

describe("deleting a conversation", () => {
  it("takes its messages and footprints, and nothing that belongs to anyone else", async () => {
    const database = await openMigratedDatabase();
    try {
      await seedConversation(database.sql);
      await createConversationsRepo(database.sql).remove("conv-1");

      expect(await count(database.sql, "conversations")).toBe(1);
      expect(await count(database.sql, "messages")).toBe(1);
      expect(await count(database.sql, "focus_sessions")).toBe(0);
      expect(await count(database.sql, "focus_nodes")).toBe(0);
      expect(await count(database.sql, "term_marks")).toBe(0);
      // The concept survives, and so does the footprint the other conversation left on it.
      expect(await count(database.sql, "knowledge_nodes")).toBe(1);
      expect(await count(database.sql, "node_sightings")).toBe(1);
      const sighting = await database.sql.select<{ conversation_id: string }>(
        "SELECT conversation_id FROM node_sightings",
      );
      expect(sighting[0]?.conversation_id).toBe("conv-2");
      // Money spent stays on the books; only the link to the deleted chat is cleared.
      expect(await count(database.sql, "llm_calls")).toBe(1);
      expect(await count(database.sql, "llm_calls", "WHERE conversation_id IS NULL")).toBe(1);
    } finally {
      database.close();
    }
  });

  it("leaves the database referentially intact afterwards", async () => {
    const database = await openMigratedDatabase();
    try {
      await seedConversation(database.sql);
      await createConversationsRepo(database.sql).remove("conv-1");
      const violations = await database.sql.select<Record<string, unknown>>(
        "PRAGMA foreign_key_check",
      );
      expect(violations).toEqual([]);
    } finally {
      database.close();
    }
  });
});
