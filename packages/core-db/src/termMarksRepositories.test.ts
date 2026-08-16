/**
 * Purpose: unit tests for createTermMarksRepo using an in-memory fake SqlClient — confirms a
 * target with no cached verdict looks up as null, an inserted row round-trips, and two
 * different targets never collide.
 */
import { describe, expect, it } from "vitest";
import { createTermMarksRepo } from "./termMarksRepositories";
import { withSequentialTransactions } from "./transactionFallback";
import type { SqlClient, TermMarkRow } from "./types";

function makeFakeSql() {
  const rows: TermMarkRow[] = [];
  const client: SqlClient = withSequentialTransactions({
    select: <Row>(sql: string, params?: readonly unknown[]) => {
      if (sql.includes("FROM term_marks WHERE target_kind = ? AND target_id = ?")) {
        const [targetKind, targetId] = params as [string, string];
        return Promise.resolve(
          rows.filter(
            (row) => row.target_kind === targetKind && row.target_id === targetId,
          ) as Row[],
        );
      }
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("INSERT INTO term_marks")) {
        const [id, target_kind, target_id, terms_json, created_at] = params as [
          string,
          "message" | "focus_node",
          string,
          string,
          string,
        ];
        rows.push({ id, target_kind, target_id, terms_json, created_at });
      }
      return Promise.resolve();
    },
  });
  return { client, rows };
}

describe("createTermMarksRepo", () => {
  it("returns null for a target with no cached verdict", async () => {
    const { client } = makeFakeSql();
    const repo = createTermMarksRepo(client);
    expect(await repo.getByTarget("message", "m1")).toBeNull();
  });

  it("round-trips an inserted verdict by (target_kind, target_id)", async () => {
    const { client } = makeFakeSql();
    const repo = createTermMarksRepo(client);
    await repo.insert({
      id: "tm1",
      target_kind: "message",
      target_id: "m1",
      terms_json: JSON.stringify(["闭包", "词法环境"]),
      created_at: "2026-08-14T10:00:00Z",
    });

    expect(await repo.getByTarget("message", "m1")).toMatchObject({
      id: "tm1",
      terms_json: JSON.stringify(["闭包", "词法环境"]),
    });
    expect(await repo.getByTarget("focus_node", "m1")).toBeNull();
    expect(await repo.getByTarget("message", "other")).toBeNull();
  });

  it("keeps message and focus_node targets with the same id separate", async () => {
    const { client } = makeFakeSql();
    const repo = createTermMarksRepo(client);
    await repo.insert({
      id: "tm1",
      target_kind: "message",
      target_id: "x1",
      terms_json: JSON.stringify(["甲"]),
      created_at: "2026-08-14T10:00:00Z",
    });
    await repo.insert({
      id: "tm2",
      target_kind: "focus_node",
      target_id: "x1",
      terms_json: JSON.stringify(["乙"]),
      created_at: "2026-08-14T10:01:00Z",
    });

    expect(await repo.getByTarget("message", "x1")).toMatchObject({
      terms_json: JSON.stringify(["甲"]),
    });
    expect(await repo.getByTarget("focus_node", "x1")).toMatchObject({
      terms_json: JSON.stringify(["乙"]),
    });
  });
});
