/**
 * Purpose: unit tests for runPendingResearchTasks — tampered-signature silent skip,
 * run-once and expiry guards, a successful run's stored result, and the time-budget
 * retirement path, all against an in-memory fake SqlClient.
 */

import type { SqlClient } from "@breadcrumb/core-db";
import { withSequentialTransactions } from "@breadcrumb/core-db";
import { ed25519 } from "@noble/curves/ed25519.js";
import { describe, expect, it } from "vitest";
import { runPendingResearchTasks, TASK_TIME_BUDGET_MS } from "./executor";
import type { ResearchTask, SignedResearchTask } from "./taskSchema";
import { signResearchTask } from "./taskSignature";

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const privateKey = ed25519.utils.randomSecretKey();
const privateHex = toHex(privateKey);
const publicHex = toHex(ed25519.getPublicKey(privateKey));

function sign(payload: ResearchTask): SignedResearchTask {
  return { payload, signature: signResearchTask(payload, privateHex) };
}

const baseTask: ResearchTask = {
  id: "sample-study",
  institution: "Test University",
  title: "Concept count",
  purpose: "Understand how many concepts learners accumulate for a spacing-research baseline.",
  calls: [{ fn: "count", metric: "concepts_known" }],
  display: [{ kind: "stat", label: "concepts", callIndex: 0 }],
  expiresAt: "2030-01-01",
};

interface TaskRunRow {
  task_id: string;
  ran_at: string;
}
interface ResultRow {
  id: string;
  task_id: string;
  institution: string;
  title: string;
  purpose: string;
  ethics_note: string | null;
  display_json: string;
  results_json: string;
  computed_at: string;
}

/** In-memory fake covering research_task_runs / research_results plus enough of
 * knowledge_nodes for the sample task's single `count concepts_known` call. */
function makeFakeSql(options?: { knowledgeNodeCount?: number }) {
  const knowledgeNodeCount = options?.knowledgeNodeCount ?? 3;
  const taskRuns: TaskRunRow[] = [];
  const results: ResultRow[] = [];
  const client: SqlClient = withSequentialTransactions({
    select: async <Row>(sql: string): Promise<Row[]> => {
      if (sql.includes("FROM research_task_runs")) return taskRuns as unknown as Row[];
      if (sql.includes("COUNT(*) AS n FROM knowledge_nodes")) {
        return [{ n: knowledgeNodeCount }] as unknown as Row[];
      }
      return [] as Row[];
    },
    execute: async (sql: string, params?: readonly unknown[]): Promise<void> => {
      if (sql.startsWith("INSERT OR IGNORE INTO research_task_runs")) {
        const [taskId, ranAt] = params as [string, string];
        if (!taskRuns.some((row) => row.task_id === taskId)) {
          taskRuns.push({ task_id: taskId, ran_at: ranAt });
        }
      } else if (sql.startsWith("INSERT OR REPLACE INTO research_results")) {
        const [
          id,
          taskId,
          institution,
          title,
          purpose,
          ethicsNote,
          displayJson,
          resultsJson,
          computedAt,
        ] = params as [
          string,
          string,
          string,
          string,
          string,
          string | null,
          string,
          string,
          string,
        ];
        results.push({
          id,
          task_id: taskId,
          institution,
          title,
          purpose,
          ethics_note: ethicsNote,
          display_json: displayJson,
          results_json: resultsJson,
          computed_at: computedAt,
        });
      }
    },
  });
  return { client, taskRuns, results };
}

function makeDeps(sql: SqlClient, nowIso = "2026-08-13T10:00:00.000Z") {
  const failures: string[] = [];
  return {
    sql,
    now: () => new Date(nowIso),
    recordFailure: async (message: string) => {
      failures.push(message);
    },
    publicKeyHex: publicHex,
    failures,
  };
}

describe("runPendingResearchTasks", () => {
  it("silently drops a task with a tampered payload and records the failure", async () => {
    const { client, taskRuns, results } = makeFakeSql();
    const deps = makeDeps(client);
    const signed = sign(baseTask);
    const tampered: SignedResearchTask = {
      ...signed,
      payload: { ...signed.payload, title: "Tampered title" },
    };

    const executed = await runPendingResearchTasks([tampered], deps);

    expect(executed).toBe(0);
    expect(results).toHaveLength(0);
    expect(taskRuns).toHaveLength(0);
    expect(deps.failures).toEqual([`task ${baseTask.id}: signature verification failed`]);
  });

  it("does not rerun a task already recorded as run", async () => {
    const { client, taskRuns, results } = makeFakeSql();
    taskRuns.push({ task_id: baseTask.id, ran_at: "2026-08-01T00:00:00.000Z" });
    const deps = makeDeps(client);

    const executed = await runPendingResearchTasks([sign(baseTask)], deps);

    expect(executed).toBe(0);
    expect(results).toHaveLength(0);
    expect(deps.failures).toEqual([]);
  });

  it("skips an expired task without recording a run or a result", async () => {
    const { client, taskRuns, results } = makeFakeSql();
    const expiredTask: ResearchTask = { ...baseTask, expiresAt: "2020-01-01" };
    const deps = makeDeps(client, "2026-08-13T10:00:00.000Z");

    const executed = await runPendingResearchTasks([sign(expiredTask)], deps);

    expect(executed).toBe(0);
    expect(results).toHaveLength(0);
    expect(taskRuns).toHaveLength(0);
  });

  it("stores a research_results row for a valid, unexpired, unrun task", async () => {
    const { client, taskRuns, results } = makeFakeSql({ knowledgeNodeCount: 7 });
    const deps = makeDeps(client);

    const executed = await runPendingResearchTasks([sign(baseTask)], deps);

    expect(executed).toBe(1);
    expect(taskRuns.map((row) => row.task_id)).toEqual([baseTask.id]);
    expect(results).toHaveLength(1);
    const stored = results[0];
    expect(stored?.institution).toBe(baseTask.institution);
    expect(stored?.ethics_note).toBeNull();
    expect(JSON.parse(stored?.results_json ?? "[]")).toEqual([{ kind: "number", value: 7, n: 7 }]);
    expect(deps.failures).toEqual([]);
  });

  it("retires a task that exceeds its time budget: run recorded, no result stored", async () => {
    const { client, taskRuns, results } = makeFakeSql();
    const baseMs = Date.parse("2026-08-13T10:00:00.000Z");
    let callCount = 0;
    const failures: string[] = [];
    const deps = {
      sql: client,
      // First call is `startedAt`; every call after is far past TASK_TIME_BUDGET_MS, so the
      // very first per-call budget check throws before any statistic is computed.
      now: () => {
        callCount += 1;
        return new Date(callCount === 1 ? baseMs : baseMs + TASK_TIME_BUDGET_MS + 1000);
      },
      recordFailure: async (message: string) => {
        failures.push(message);
      },
      publicKeyHex: publicHex,
    };

    const executed = await runPendingResearchTasks([sign(baseTask)], deps);

    expect(executed).toBe(0);
    expect(results).toHaveLength(0);
    expect(taskRuns.map((row) => row.task_id)).toEqual([baseTask.id]);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("time budget exceeded");
  });
});
