/**
 * Purpose: unit tests for createPracticeRepo using an in-memory fake SqlClient — score
 * upsert+list round-trip and overwrite-on-same-item_id semantics (spec 029).
 */
import { describe, expect, it } from "vitest";
import { createPracticeRepo } from "./practiceRepositories";
import type { PracticeScoreRow, SqlClient } from "./types";

function makeFakeSql() {
  const rows = new Map<string, PracticeScoreRow>();
  const client: SqlClient = {
    select: <Row>(sql: string) => {
      if (sql.includes("FROM practice_scores")) {
        return Promise.resolve([...rows.values()] as Row[]);
      }
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("INSERT OR REPLACE INTO practice_scores")) {
        const [item_id, score, scored_at] = params as [string, number, string];
        rows.set(item_id, { item_id, score, scored_at });
      }
      return Promise.resolve();
    },
  };
  return { client, rows };
}

describe("createPracticeRepo", () => {
  it("round-trips a score through upsertScore/listScores", async () => {
    const { client } = makeFakeSql();
    const repo = createPracticeRepo(client);
    await repo.upsertScore({
      item_id: "item1",
      score: 10,
      scored_at: "2026-08-11T10:00:00.000Z",
    });
    const scores = await repo.listScores();
    expect(scores).toHaveLength(1);
    expect(scores[0]?.score).toBe(10);
  });

  it("overwrites the previous score for the same item", async () => {
    const { client } = makeFakeSql();
    const repo = createPracticeRepo(client);
    await repo.upsertScore({ item_id: "item1", score: 3, scored_at: "t1" });
    await repo.upsertScore({ item_id: "item1", score: 7, scored_at: "t2" });
    const scores = await repo.listScores();
    expect(scores).toHaveLength(1);
    expect(scores[0]?.score).toBe(7);
    expect(scores[0]?.scored_at).toBe("t2");
  });
});
