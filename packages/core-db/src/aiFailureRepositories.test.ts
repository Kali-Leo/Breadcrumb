/**
 * Purpose: unit tests for createAiFailuresRepo using an in-memory fake SqlClient — insert,
 * limit, and most-recent-first ordering.
 */
import { describe, expect, it } from "vitest";
import { createAiFailuresRepo } from "./aiFailureRepositories";
import type { AiFailureRow } from "./featureTypes";
import { withSequentialTransactions } from "./transactionFallback";
import type { SqlClient } from "./types";

/** In-memory fake keyed by insertion order. */
function makeFakeSql() {
  const rows: AiFailureRow[] = [];
  const client: SqlClient = withSequentialTransactions({
    select: <Row>(sql: string, params?: readonly unknown[]) => {
      if (sql.includes("FROM ai_failures")) {
        const limit = Number(params?.[0] ?? rows.length);
        const sorted = [...rows].sort(
          (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
        );
        return Promise.resolve(sorted.slice(0, limit) as Row[]);
      }
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("INSERT INTO ai_failures")) {
        const [id, purpose, message, created_at] = params as [string, string, string, string];
        rows.push({ id, purpose, message, created_at });
      }
      return Promise.resolve();
    },
  });
  return { client, rows };
}

describe("createAiFailuresRepo", () => {
  it("records and lists a failure", async () => {
    const { client } = makeFakeSql();
    const repo = createAiFailuresRepo(client);
    await repo.record({
      id: "f1",
      purpose: "interest",
      message: "network timeout",
      created_at: "2026-08-01T10:00:00Z",
    });
    const recent = await repo.listRecent(20);
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({ purpose: "interest", message: "network timeout" });
  });

  it("lists most-recent-first", async () => {
    const { client } = makeFakeSql();
    const repo = createAiFailuresRepo(client);
    await repo.record({
      id: "f1",
      purpose: "interest",
      message: "older",
      created_at: "2026-08-01T10:00:00Z",
    });
    await repo.record({
      id: "f2",
      purpose: "knowledge-edges",
      message: "newer",
      created_at: "2026-08-01T11:00:00Z",
    });
    const recent = await repo.listRecent(20);
    expect(recent.map((r) => r.id)).toEqual(["f2", "f1"]);
  });

  it("caps results at the given limit", async () => {
    const { client } = makeFakeSql();
    const repo = createAiFailuresRepo(client);
    for (let i = 0; i < 25; i += 1) {
      await repo.record({
        id: `f${i}`,
        purpose: "interest",
        message: `failure ${i}`,
        created_at: `2026-08-01T10:${String(i).padStart(2, "0")}:00Z`,
      });
    }
    const recent = await repo.listRecent(20);
    expect(recent).toHaveLength(20);
    expect(recent[0]?.id).toBe("f24");
  });

  it("returns an empty list when no failures were ever recorded", async () => {
    const { client } = makeFakeSql();
    const repo = createAiFailuresRepo(client);
    expect(await repo.listRecent(20)).toEqual([]);
  });
});
