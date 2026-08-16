/**
 * Purpose: unit tests for createMessagesRepo using an in-memory fake SqlClient — append
 * persists the dormant teaching_mode and parent_id columns, listByConversation round-trips
 * them unchanged.
 */
import { describe, expect, it } from "vitest";
import { createMessagesRepo } from "./repositories";
import { withSequentialTransactions } from "./transactionFallback";
import type { MessageRow, SqlClient } from "./types";

/** In-memory fake: stores appended messages and answers listByConversation. */
function makeFakeSql() {
  const rows: MessageRow[] = [];
  const client: SqlClient = withSequentialTransactions({
    select: <Row>(sql: string) => {
      if (sql.includes("FROM messages")) return Promise.resolve(rows as Row[]);
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("INSERT INTO messages")) {
        const [id, conversation_id, role, content, created_at, teaching_mode, parent_id] =
          params as [
            string,
            string,
            MessageRow["role"],
            string,
            string,
            string | null,
            string | null,
          ];
        rows.push({ id, conversation_id, role, content, created_at, teaching_mode, parent_id });
      }
      return Promise.resolve();
    },
  });
  return { client, rows };
}

describe("createMessagesRepo", () => {
  it("persists teaching_mode and parent_id on append and returns them via listByConversation", async () => {
    const { client } = makeFakeSql();
    const repo = createMessagesRepo(client);
    await repo.append({
      id: "m1",
      conversation_id: "c1",
      role: "assistant",
      content: "hi",
      created_at: "2026-08-13T10:00:00Z",
      teaching_mode: "direct",
      parent_id: null,
    });
    await repo.append({
      id: "m2",
      conversation_id: "c1",
      role: "user",
      content: "ok",
      created_at: "2026-08-13T10:01:00Z",
      teaching_mode: null,
      parent_id: "m1",
    });
    const listed = await repo.listByConversation("c1");
    expect(listed.map((row) => row.teaching_mode)).toEqual(["direct", null]);
    expect(listed.map((row) => row.parent_id)).toEqual([null, "m1"]);
  });
});
