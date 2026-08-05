/**
 * Purpose: unit tests for createGoalLaddersRepo using an in-memory fake SqlClient — whole-board
 * figure replacement with position ordering, and state-row upsert/get round-trips.
 */
import { describe, expect, it } from "vitest";
import { createGoalLaddersRepo } from "./goalLadderRepositories";
import type { GoalLadderFigureRow, GoalLadderStateRow, SqlClient } from "./types";

function makeFakeSql() {
  const figureRows = new Map<string, GoalLadderFigureRow>();
  const stateRows = new Map<string, GoalLadderStateRow>();
  const client: SqlClient = {
    select: <Row>(sql: string, params?: readonly unknown[]) => {
      if (sql.includes("FROM goal_ladder_figures")) {
        const [goalId] = params as [string];
        return Promise.resolve(
          [...figureRows.values()]
            .filter((row) => row.goal_id === goalId)
            .sort((a, b) => a.position - b.position) as Row[],
        );
      }
      if (sql.includes("FROM goal_ladder_state")) {
        const [goalId] = params as [string];
        const row = stateRows.get(goalId);
        return Promise.resolve((row === undefined ? [] : [row]) as Row[]);
      }
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("DELETE FROM goal_ladder_figures")) {
        const [goalId] = params as [string];
        for (const [id, row] of figureRows) {
          if (row.goal_id === goalId) figureRows.delete(id);
        }
      }
      if (sql.startsWith("INSERT INTO goal_ladder_figures")) {
        const [
          id,
          goal_id,
          name,
          age,
          era,
          occupation,
          self_line,
          rank,
          position,
          generation,
          chat_profile_json,
          created_at,
        ] = params as [
          string,
          string,
          string,
          number,
          string,
          string,
          string,
          number,
          number,
          number,
          string,
          string,
        ];
        figureRows.set(id, {
          id,
          goal_id,
          name,
          age,
          era,
          occupation,
          self_line,
          rank,
          position,
          generation,
          chat_profile_json,
          created_at,
        });
      }
      if (sql.startsWith("INSERT INTO goal_ladder_state")) {
        const [goal_id, last_shown_rank, last_view_fuel, next_refresh_at, generation, updated_at] =
          params as [string, number | null, number | null, string, number, string];
        stateRows.set(goal_id, {
          goal_id,
          last_shown_rank,
          last_view_fuel,
          next_refresh_at,
          generation,
          updated_at,
        });
      }
      return Promise.resolve();
    },
  };
  return { client };
}

function figure(overrides: Partial<GoalLadderFigureRow> = {}): GoalLadderFigureRow {
  return {
    id: "f1",
    goal_id: "g1",
    name: "拿破仑",
    age: 24,
    era: "18世纪末",
    occupation: "军官",
    self_line: "土伦港的炮位还记得我",
    rank: 450,
    position: 0,
    generation: 1,
    chat_profile_json: JSON.stringify({
      personality: "果断",
      activeHours: "清晨活跃",
      replyStyle: "简短命令式",
    }),
    created_at: "2026-08-05T10:00:00Z",
    ...overrides,
  };
}

describe("createGoalLaddersRepo", () => {
  it("replaces a goal's board and lists it back in position order", async () => {
    const { client } = makeFakeSql();
    const repo = createGoalLaddersRepo(client);
    await repo.replaceFigures("g1", [
      figure({ id: "f2", position: 1, name: "b" }),
      figure({ id: "f1", position: 0, name: "a" }),
    ]);
    const rows = await repo.listFigures("g1");
    expect(rows.map((row) => row.id)).toEqual(["f1", "f2"]);
  });

  it("deletes the previous board's rows before inserting the new one", async () => {
    const { client } = makeFakeSql();
    const repo = createGoalLaddersRepo(client);
    await repo.replaceFigures("g1", [figure({ id: "f1", generation: 1 })]);
    await repo.replaceFigures("g1", [figure({ id: "f2", generation: 2 })]);
    const rows = await repo.listFigures("g1");
    expect(rows.map((row) => row.id)).toEqual(["f2"]);
  });

  it("only lists rows for the requested goal", async () => {
    const { client } = makeFakeSql();
    const repo = createGoalLaddersRepo(client);
    await repo.replaceFigures("g1", [figure({ id: "f1", goal_id: "g1" })]);
    await repo.replaceFigures("g2", [figure({ id: "f2", goal_id: "g2" })]);
    expect((await repo.listFigures("g1")).map((row) => row.id)).toEqual(["f1"]);
    expect((await repo.listFigures("g2")).map((row) => row.id)).toEqual(["f2"]);
  });

  it("returns null state before the first upsert, then round-trips the whole row", async () => {
    const { client } = makeFakeSql();
    const repo = createGoalLaddersRepo(client);
    expect(await repo.getState("g1")).toBeNull();
    const state: GoalLadderStateRow = {
      goal_id: "g1",
      last_shown_rank: 120_431,
      last_view_fuel: 4.5,
      next_refresh_at: "2026-08-06T08:00:00.000Z",
      generation: 2,
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
      last_shown_rank: null,
      last_view_fuel: null,
      next_refresh_at: "1970-01-01T00:00:00.000Z",
      generation: 1,
      updated_at: "2026-08-05T10:00:00.000Z",
    };
    await repo.upsertState(base);
    await repo.upsertState({ ...base, last_shown_rank: 99_120, generation: 2 });
    const stored = await repo.getState("g1");
    expect(stored?.last_shown_rank).toBe(99_120);
    expect(stored?.generation).toBe(2);
  });
});
