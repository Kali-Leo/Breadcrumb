/**
 * Purpose: unit tests for createResearchRepo using an in-memory fake SqlClient — run
 * bookkeeping survives result deletion, results order newest-first, deletes are physical.
 */
import { describe, expect, it } from "vitest";
import { createResearchRepo, type ResearchResultRow } from "./researchRepositories";
import type { SqlClient } from "./types";

function makeFakeSql() {
  const runs = new Map<string, string>();
  const results = new Map<string, ResearchResultRow>();
  const client: SqlClient = {
    select: <Row>(sql: string) => {
      if (sql.includes("FROM research_task_runs")) {
        const rows = [...runs.entries()].map(([task_id, ran_at]) => ({ task_id, ran_at }));
        return Promise.resolve(rows as Row[]);
      }
      if (sql.includes("FROM research_results")) {
        const rows = [...results.values()].sort(
          (a, b) => b.computed_at.localeCompare(a.computed_at) || b.id.localeCompare(a.id),
        );
        return Promise.resolve(rows as Row[]);
      }
      throw new Error(`unexpected select: ${sql}`);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.includes("INTO research_task_runs")) {
        const [taskId, ranAt] = params as [string, string];
        if (!runs.has(taskId)) runs.set(taskId, ranAt);
      } else if (sql.includes("INTO research_results")) {
        const row = paramsToResultRow(params as readonly unknown[]);
        results.set(row.task_id, row);
      } else if (sql.includes("DELETE FROM research_results")) {
        const [id] = params as [string];
        for (const [key, row] of results) if (row.id === id) results.delete(key);
      } else {
        throw new Error(`unexpected execute: ${sql}`);
      }
      return Promise.resolve();
    },
  };
  return client;
}

function paramsToResultRow(params: readonly unknown[]): ResearchResultRow {
  const [
    id,
    task_id,
    institution,
    title,
    purpose,
    ethics_note,
    display_json,
    results_json,
    computed_at,
  ] = params as [string, string, string, string, string, string | null, string, string, string];
  return {
    id,
    task_id,
    institution,
    title,
    purpose,
    ethics_note,
    display_json,
    results_json,
    computed_at,
  };
}

const row = (id: string, computedAt: string): ResearchResultRow => ({
  id: `research-${id}`,
  task_id: id,
  institution: "Test University",
  title: "t",
  purpose: "p",
  ethics_note: null,
  display_json: "[]",
  results_json: "[]",
  computed_at: computedAt,
});

describe("createResearchRepo", () => {
  it("keeps run bookkeeping independent of result deletion", async () => {
    const repo = createResearchRepo(makeFakeSql());
    await repo.recordRun("study-a", "2026-08-13T00:00:00Z");
    await repo.saveResult(row("study-a", "2026-08-13T00:00:00Z"));
    await repo.deleteResult("research-study-a");
    expect(await repo.listResults()).toEqual([]);
    expect(await repo.listRunTaskIds()).toEqual(["study-a"]);
  });

  it("lists results newest first", async () => {
    const repo = createResearchRepo(makeFakeSql());
    await repo.saveResult(row("old", "2026-08-01T00:00:00Z"));
    await repo.saveResult(row("new", "2026-08-13T00:00:00Z"));
    const listed = await repo.listResults();
    expect(listed.map((entry) => entry.task_id)).toEqual(["new", "old"]);
  });

  it("recordRun is idempotent and keeps the first timestamp", async () => {
    const repo = createResearchRepo(makeFakeSql());
    await repo.recordRun("study-a", "2026-08-01T00:00:00Z");
    await repo.recordRun("study-a", "2026-08-13T00:00:00Z");
    expect(await repo.listRunTaskIds()).toEqual(["study-a"]);
  });
});
