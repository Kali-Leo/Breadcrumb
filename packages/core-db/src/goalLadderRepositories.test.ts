/**
 * Purpose: unit tests for createGoalLaddersRepo using an in-memory fake SqlClient — the
 * single per-goal state row's upsert/get round-trips (spec 021: state only, no board tables).
 */
import { describe, expect, it } from "vitest";
import { createGoalLaddersRepo } from "./goalLadderRepositories";
import type { GoalLadderStateRow, SqlClient } from "./types";

function makeFakeSql() {
  const stateRows = new Map<string, GoalLadderStateRow>();
  const client: SqlClient = {
    select: <Row>(sql: string, params?: readonly unknown[]) => {
      if (sql.includes("FROM goal_ladder_state")) {
        const [goalId] = params as [string];
        const row = stateRows.get(goalId);
        return Promise.resolve((row === undefined ? [] : [row]) as Row[]);
      }
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("INSERT INTO goal_ladder_state")) {
        const [goal_id, last_shown_rank, last_view_fuel, updated_at] = params as [
          string,
          number,
          number,
          string,
        ];
        stateRows.set(goal_id, { goal_id, last_shown_rank, last_view_fuel, updated_at });
      }
      return Promise.resolve();
    },
  };
  return { client };
}

describe("createGoalLaddersRepo", () => {
  it("returns null state before the first upsert, then round-trips the whole row", async () => {
    const { client } = makeFakeSql();
    const repo = createGoalLaddersRepo(client);
    expect(await repo.getState("g1")).toBeNull();
    const state: GoalLadderStateRow = {
      goal_id: "g1",
      last_shown_rank: 120_431,
      last_view_fuel: 4.5,
      updated_at: "2026-08-05T10:00:00.000Z",
    };
    await repo.upsertState(state);
    expect(await repo.getState("g1")).toEqual(state);
  });

  it("upsert overwrites the previous state (single row per goal, no history)", async () => {
    const { client } = makeFakeSql();
    const repo = createGoalLaddersRepo(client);
    const base: GoalLadderStateRow = {
      goal_id: "g1",
      last_shown_rank: 120_431,
      last_view_fuel: 4.5,
      updated_at: "2026-08-05T10:00:00.000Z",
    };
    await repo.upsertState(base);
    await repo.upsertState({ ...base, last_shown_rank: 99_120, last_view_fuel: 9.1 });
    const stored = await repo.getState("g1");
    expect(stored?.last_shown_rank).toBe(99_120);
    expect(stored?.last_view_fuel).toBe(9.1);
  });

  it("keeps goals separate", async () => {
    const { client } = makeFakeSql();
    const repo = createGoalLaddersRepo(client);
    await repo.upsertState({
      goal_id: "g1",
      last_shown_rank: 100_000,
      last_view_fuel: 1,
      updated_at: "2026-08-05T10:00:00.000Z",
    });
    expect(await repo.getState("g2")).toBeNull();
    expect((await repo.getState("g1"))?.last_shown_rank).toBe(100_000);
  });
});
