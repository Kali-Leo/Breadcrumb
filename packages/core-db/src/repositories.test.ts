/**
 * Purpose: unit tests for createMessagesRepo's teaching-mode recording (spec 038 §2.5) using an
 * in-memory fake SqlClient — append persists the column and countByTeachingMode aggregates it.
 */
import { describe, expect, it } from "vitest";
import { createMessagesRepo } from "./repositories";
import type { MessageRow, SqlClient } from "./types";

/** In-memory fake: stores appended messages and answers the teaching-mode group-by query. */
function makeFakeSql() {
  const rows: MessageRow[] = [];
  const client: SqlClient = {
    select: <Row>(sql: string) => {
      if (sql.includes("teaching_mode, COUNT(*)")) {
        const counts = new Map<string, number>();
        for (const row of rows) {
          if (row.role !== "assistant" || row.teaching_mode === null) continue;
          counts.set(row.teaching_mode, (counts.get(row.teaching_mode) ?? 0) + 1);
        }
        return Promise.resolve(
          [...counts.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([teaching_mode, count]) => ({ teaching_mode, count })) as Row[],
        );
      }
      if (sql.includes("FROM messages")) return Promise.resolve(rows as Row[]);
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("INSERT INTO messages")) {
        const [id, conversation_id, role, content, created_at, teaching_mode] = params as [
          string,
          string,
          MessageRow["role"],
          string,
          string,
          string | null,
        ];
        rows.push({ id, conversation_id, role, content, created_at, teaching_mode });
      }
      return Promise.resolve();
    },
  };
  return { client, rows };
}

describe("createMessagesRepo", () => {
  it("persists teaching_mode on append and returns it via listByConversation", async () => {
    const { client } = makeFakeSql();
    const repo = createMessagesRepo(client);
    await repo.append({
      id: "m1",
      conversation_id: "c1",
      role: "assistant",
      content: "hi",
      created_at: "2026-08-13T10:00:00Z",
      teaching_mode: "direct",
    });
    await repo.append({
      id: "m2",
      conversation_id: "c1",
      role: "user",
      content: "ok",
      created_at: "2026-08-13T10:01:00Z",
      teaching_mode: null,
    });
    const listed = await repo.listByConversation("c1");
    expect(listed.map((row) => row.teaching_mode)).toEqual(["direct", null]);
  });

  it("counts assistant messages per teaching mode, ignoring null and user rows", async () => {
    const { client } = makeFakeSql();
    const repo = createMessagesRepo(client);
    await repo.append({
      id: "m1",
      conversation_id: "c1",
      role: "assistant",
      content: "a",
      created_at: "2026-08-13T10:00:00Z",
      teaching_mode: "adaptive",
    });
    await repo.append({
      id: "m2",
      conversation_id: "c1",
      role: "assistant",
      content: "b",
      created_at: "2026-08-13T10:01:00Z",
      teaching_mode: "adaptive",
    });
    await repo.append({
      id: "m3",
      conversation_id: "c1",
      role: "assistant",
      content: "c",
      created_at: "2026-08-13T10:02:00Z",
      teaching_mode: "guided",
    });
    await repo.append({
      id: "m4",
      conversation_id: "c1",
      role: "user",
      content: "d",
      created_at: "2026-08-13T10:03:00Z",
      teaching_mode: null,
    });
    await repo.append({
      id: "m5",
      conversation_id: "c1",
      role: "assistant",
      content: "e",
      created_at: "2026-08-13T10:04:00Z",
      teaching_mode: null,
    });
    expect(await repo.countByTeachingMode()).toEqual([
      { teaching_mode: "adaptive", count: 2 },
      { teaching_mode: "guided", count: 1 },
    ]);
  });
});
