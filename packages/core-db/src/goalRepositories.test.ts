/**
 * Purpose: unit tests for createGoalsRepo using an in-memory fake SqlClient — insert,
 * title/node-id updates, most-recently-touched ordering, and removal.
 */
import { describe, expect, it } from "vitest";
import { createGoalsRepo } from "./goalRepositories";
import type { GoalRow, SqlClient } from "./types";

/** In-memory fake keyed by goal id. */
function makeFakeSql() {
  const rows = new Map<string, GoalRow>();
  const client: SqlClient = {
    select: <Row>(sql: string) => {
      if (sql.includes("FROM goals")) {
        return Promise.resolve(
          [...rows.values()].sort(
            (a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id),
          ) as Row[],
        );
      }
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("INSERT INTO goals")) {
        const [id, title, node_ids_json, created_at, updated_at] = params as [
          string,
          string,
          string,
          string,
          string,
        ];
        rows.set(id, { id, title, node_ids_json, created_at, updated_at });
      }
      if (sql.startsWith("UPDATE goals SET title")) {
        const [title, updated_at, id] = params as [string, string, string];
        const row = rows.get(id);
        if (row) rows.set(id, { ...row, title, updated_at });
      }
      if (sql.startsWith("UPDATE goals SET node_ids_json")) {
        const [node_ids_json, updated_at, id] = params as [string, string, string];
        const row = rows.get(id);
        if (row) rows.set(id, { ...row, node_ids_json, updated_at });
      }
      if (sql.startsWith("DELETE FROM goals")) {
        const [id] = params as [string];
        rows.delete(id);
      }
      return Promise.resolve();
    },
  };
  return { client, rows };
}

describe("createGoalsRepo", () => {
  it("inserts and lists a goal", async () => {
    const { client } = makeFakeSql();
    const repo = createGoalsRepo(client);
    await repo.insert({
      id: "g1",
      title: "通过考研数学",
      node_ids_json: JSON.stringify(["n1", "n2"]),
      created_at: "2026-08-01T10:00:00Z",
      updated_at: "2026-08-01T10:00:00Z",
    });
    const all = await repo.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.title).toBe("通过考研数学");
    expect(JSON.parse(all[0]?.node_ids_json ?? "[]")).toEqual(["n1", "n2"]);
  });

  it("updates the title without touching node_ids_json", async () => {
    const { client } = makeFakeSql();
    const repo = createGoalsRepo(client);
    await repo.insert({
      id: "g1",
      title: "旧标题",
      node_ids_json: JSON.stringify(["n1"]),
      created_at: "2026-08-01T10:00:00Z",
      updated_at: "2026-08-01T10:00:00Z",
    });
    await repo.updateTitle("g1", "新标题", "2026-08-01T11:00:00Z");
    const [goal] = await repo.listAll();
    expect(goal?.title).toBe("新标题");
    expect(JSON.parse(goal?.node_ids_json ?? "[]")).toEqual(["n1"]);
    expect(goal?.updated_at).toBe("2026-08-01T11:00:00Z");
  });

  it("updates node_ids_json without touching the title", async () => {
    const { client } = makeFakeSql();
    const repo = createGoalsRepo(client);
    await repo.insert({
      id: "g1",
      title: "标题不变",
      node_ids_json: JSON.stringify(["n1"]),
      created_at: "2026-08-01T10:00:00Z",
      updated_at: "2026-08-01T10:00:00Z",
    });
    await repo.updateNodeIds("g1", ["n1", "n2", "n3"], "2026-08-01T12:00:00Z");
    const [goal] = await repo.listAll();
    expect(goal?.title).toBe("标题不变");
    expect(JSON.parse(goal?.node_ids_json ?? "[]")).toEqual(["n1", "n2", "n3"]);
  });

  it("lists most-recently-touched goal first", async () => {
    const { client } = makeFakeSql();
    const repo = createGoalsRepo(client);
    await repo.insert({
      id: "g1",
      title: "older",
      node_ids_json: "[]",
      created_at: "2026-08-01T10:00:00Z",
      updated_at: "2026-08-01T10:00:00Z",
    });
    await repo.insert({
      id: "g2",
      title: "newer",
      node_ids_json: "[]",
      created_at: "2026-08-01T09:00:00Z",
      updated_at: "2026-08-01T11:00:00Z",
    });
    const all = await repo.listAll();
    expect(all.map((g) => g.id)).toEqual(["g2", "g1"]);
  });

  it("removes a goal by id", async () => {
    const { client } = makeFakeSql();
    const repo = createGoalsRepo(client);
    await repo.insert({
      id: "g1",
      title: "x",
      node_ids_json: "[]",
      created_at: "2026-08-01T10:00:00Z",
      updated_at: "2026-08-01T10:00:00Z",
    });
    await repo.remove("g1");
    expect(await repo.listAll()).toHaveLength(0);
  });
});
