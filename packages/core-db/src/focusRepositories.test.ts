/**
 * Purpose: unit tests for createFocusSessionsRepo and createFocusNodesRepo using an in-memory
 * fake SqlClient — confirms session lookup by id/entry-message and node ordering.
 */
import { describe, expect, it } from "vitest";
import { createFocusNodesRepo, createFocusSessionsRepo } from "./focusRepositories";
import type { FocusNodeRow, FocusSessionRow, SqlClient } from "./types";

/** In-memory fake keyed by table name inferred from the SQL text. */
function makeFakeSql() {
  const sessionRows: FocusSessionRow[] = [];
  const nodeRows: FocusNodeRow[] = [];
  const client: SqlClient = {
    select: <Row>(sql: string, params?: readonly unknown[]) => {
      if (sql.includes("FROM focus_sessions WHERE id = ?")) {
        const [id] = params as [string];
        return Promise.resolve(sessionRows.filter((row) => row.id === id) as Row[]);
      }
      if (sql.includes("FROM focus_sessions WHERE entry_message_id = ?")) {
        const [messageId] = params as [string];
        return Promise.resolve(
          sessionRows.filter((row) => row.entry_message_id === messageId) as Row[],
        );
      }
      if (sql.includes("FROM focus_sessions WHERE conversation_id = ?")) {
        const [conversationId] = params as [string];
        return Promise.resolve(
          sessionRows.filter((row) => row.conversation_id === conversationId) as Row[],
        );
      }
      if (sql.includes("FROM focus_nodes WHERE session_id = ?")) {
        const [sessionId] = params as [string];
        return Promise.resolve(nodeRows.filter((row) => row.session_id === sessionId) as Row[]);
      }
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("INSERT INTO focus_sessions")) {
        const [id, conversation_id, entry_message_id, root_label, created_at, updated_at] =
          params as [string, string, string | null, string, string, string];
        sessionRows.push({
          id,
          conversation_id,
          entry_message_id,
          root_label,
          created_at,
          updated_at,
        });
      }
      if (sql.startsWith("UPDATE focus_sessions SET entry_message_id")) {
        const [messageId, updatedAt, id] = params as [string, string, string];
        const row = sessionRows.find((r) => r.id === id);
        if (row) {
          row.entry_message_id = messageId;
          row.updated_at = updatedAt;
        }
      }
      if (sql.startsWith("INSERT INTO focus_nodes")) {
        const [id, session_id, parent_id, kind, label, question_text, answer_text, created_at] =
          params as [
            string,
            string,
            string | null,
            "word" | "question",
            string,
            string | null,
            string,
            string,
          ];
        nodeRows.push({
          id,
          session_id,
          parent_id,
          kind,
          label,
          question_text,
          answer_text,
          created_at,
        });
      }
      if (sql.startsWith("UPDATE focus_nodes SET answer_text")) {
        const [answerText, id] = params as [string, string];
        const row = nodeRows.find((r) => r.id === id);
        if (row) row.answer_text = answerText;
      }
      return Promise.resolve();
    },
  };
  return { client, sessionRows, nodeRows };
}

describe("createFocusSessionsRepo", () => {
  it("inserts, looks up by id and by entry message, and lists by conversation", async () => {
    const { client } = makeFakeSql();
    const repo = createFocusSessionsRepo(client);
    await repo.insert({
      id: "s1",
      conversation_id: "c1",
      entry_message_id: null,
      root_label: "闭包",
      created_at: "2026-08-14T10:00:00Z",
      updated_at: "2026-08-14T10:00:00Z",
    });

    expect(await repo.getById("s1")).toMatchObject({ root_label: "闭包" });
    expect(await repo.getByEntryMessage("m1")).toBeNull();

    await repo.setEntryMessage("s1", "m1", "2026-08-14T10:05:00Z");
    expect(await repo.getByEntryMessage("m1")).toMatchObject({ id: "s1" });
    expect(await repo.listByConversation("c1")).toHaveLength(1);
    expect(await repo.listByConversation("other")).toHaveLength(0);
  });
});

describe("createFocusNodesRepo", () => {
  it("inserts, lists in creation order, and updates an answer in place", async () => {
    const { client } = makeFakeSql();
    const repo = createFocusNodesRepo(client);
    await repo.insert({
      id: "n1",
      session_id: "s1",
      parent_id: null,
      kind: "word",
      label: "闭包",
      question_text: null,
      answer_text: "闭包是函数与其词法环境的绑定。",
      created_at: "2026-08-14T10:00:00Z",
    });
    await repo.insert({
      id: "n2",
      session_id: "s1",
      parent_id: "n1",
      kind: "question",
      label: "为什么会内存泄漏",
      question_text: "为什么闭包容易导致内存泄漏？",
      answer_text: "因为词法环境被持续引用，无法被回收。",
      created_at: "2026-08-14T10:01:00Z",
    });

    const nodes = await repo.listBySession("s1");
    expect(nodes.map((n) => n.id)).toEqual(["n1", "n2"]);

    await repo.updateAnswer("n1", "修订后的解释。");
    const updated = await repo.listBySession("s1");
    expect(updated[0]?.answer_text).toBe("修订后的解释。");
  });
});
