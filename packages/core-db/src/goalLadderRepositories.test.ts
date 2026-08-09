/**
 * Purpose: unit tests for createGoalLaddersRepo using an in-memory fake SqlClient — the
 * per-goal assessment board's upsert/get round-trips (spec 022: display cache only).
 */
import { describe, expect, it } from "vitest";
import { createGoalLaddersRepo } from "./goalLadderRepositories";
import type { GoalLadderBoardRow, SqlClient } from "./types";

function makeFakeSql() {
  const boardRows = new Map<string, GoalLadderBoardRow>();
  const client: SqlClient = {
    select: <Row>(sql: string, params?: readonly unknown[]) => {
      if (sql.includes("FROM goal_ladder_board")) {
        const [goalId] = params as [string];
        const row = boardRows.get(goalId);
        return Promise.resolve((row === undefined ? [] : [row]) as Row[]);
      }
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("INSERT INTO goal_ladder_board")) {
        const [goal_id, above_title, self_title, below_title, next_refresh_at, updated_at] =
          params as [string, string, string, string, string, string];
        boardRows.set(goal_id, {
          goal_id,
          above_title,
          self_title,
          below_title,
          next_refresh_at,
          updated_at,
        });
      }
      return Promise.resolve();
    },
  };
  return { client };
}

function board(overrides: Partial<GoalLadderBoardRow> = {}): GoalLadderBoardRow {
  return {
    goal_id: "g1",
    above_title: "闭包和原型链都摸熟了的人",
    self_title: "刚点亮闭包，原型链还没碰",
    below_title: "还在作用域链门口打转",
    next_refresh_at: "2026-08-11T08:00:00.000Z",
    updated_at: "2026-08-09T10:00:00.000Z",
    ...overrides,
  };
}

describe("createGoalLaddersRepo", () => {
  it("returns null before the first upsert, then round-trips the whole board", async () => {
    const { client } = makeFakeSql();
    const repo = createGoalLaddersRepo(client);
    expect(await repo.getBoard("g1")).toBeNull();
    const row = board();
    await repo.upsertBoard(row);
    expect(await repo.getBoard("g1")).toEqual(row);
  });

  it("upsert overwrites the previous board (single row per goal, no history)", async () => {
    const { client } = makeFakeSql();
    const repo = createGoalLaddersRepo(client);
    await repo.upsertBoard(board());
    await repo.upsertBoard(board({ self_title: "原型链也点亮了的人" }));
    const stored = await repo.getBoard("g1");
    expect(stored?.self_title).toBe("原型链也点亮了的人");
  });

  it("keeps goals separate", async () => {
    const { client } = makeFakeSql();
    const repo = createGoalLaddersRepo(client);
    await repo.upsertBoard(board({ goal_id: "g1" }));
    expect(await repo.getBoard("g2")).toBeNull();
    expect((await repo.getBoard("g1"))?.goal_id).toBe("g1");
  });
});
