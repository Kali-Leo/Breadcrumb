/**
 * Purpose: unit tests for the pure ladder helpers (spec 020) — the concrete knowledge
 * snapshot, figure-row shaping from a validated generation, and the user-row merge/sort for
 * inline display. No LLM/DB involved (requestLadderGeneration is exercised only via typecheck —
 * it's a thin chatJson + recordMeteredCall wrapper mirroring requestGoalMapping).
 */
import type { GoalLadderFigureRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { ValidatedLadderFigure } from "@breadcrumb/plugin-planner";
import { describe, expect, it } from "vitest";
import {
  buildKnowledgeSnapshot,
  buildLadderDisplayRows,
  buildLadderFigureRows,
} from "./ladderActions";

function node(id: string, label: string): KnowledgeNodeRow {
  return { id, parent_id: null, label, summary: "", kind: "concept", created_at: "t" };
}

describe("buildKnowledgeSnapshot", () => {
  const nodes = [node("a", "极限"), node("b", "导数"), node("c", "积分"), node("d", "级数")];

  it("splits touched vs not-yet items and words freshness plainly", () => {
    const mastery = new Map([
      ["a", 0.9],
      ["b", 0.5],
      ["c", 0.25],
    ]);
    const snapshot = buildKnowledgeSnapshot(["a", "b", "c", "d"], nodes, mastery, 0.45);
    expect(snapshot.learnedItems).toEqual([
      { label: "极限", freshness: "熟" },
      { label: "导数", freshness: "刚学会" },
      { label: "积分", freshness: "有点生疏" },
    ]);
    expect(snapshot.notYetLabels).toEqual(["级数"]);
  });

  it("never uses percentages — freshness is one of the three plain words", () => {
    const mastery = new Map([
      ["a", 0.83],
      ["b", 0.46],
      ["c", 0.31],
    ]);
    const snapshot = buildKnowledgeSnapshot(["a", "b", "c"], nodes, mastery, 0.45);
    for (const item of snapshot.learnedItems) {
      expect(["熟", "刚学会", "有点生疏"]).toContain(item.freshness);
      expect(item.freshness).not.toMatch(/[%％\d]/);
    }
  });

  it("caps both lists and skips ids without a known node", () => {
    const manyIds = Array.from({ length: 30 }, (_, index) => `n${index}`);
    const manyNodes = manyIds.map((id) => node(id, `点${id}`));
    const touched = new Map(manyIds.slice(0, 20).map((id) => [id, 0.9]));
    const snapshot = buildKnowledgeSnapshot([...manyIds, "ghost"], manyNodes, touched, 0.45);
    expect(snapshot.learnedItems.length).toBeLessThanOrEqual(12);
    expect(snapshot.notYetLabels.length).toBeLessThanOrEqual(8);
  });
});

function validatedFigure(overrides: Partial<ValidatedLadderFigure> = {}): ValidatedLadderFigure {
  return {
    name: "拿破仑",
    age: 24,
    era: "18世纪末",
    occupation: "军官",
    selfLine: "土伦港的炮位还记得我",
    chatProfile: { personality: "果断", activeHours: "清晨活跃", replyStyle: "简短命令式" },
    position: 0,
    ...overrides,
  };
}

describe("buildLadderFigureRows", () => {
  it("stamps every row with the same generation, anchored to its slot rank", () => {
    const validated = [
      validatedFigure({ name: "a", position: 0 }),
      validatedFigure({ name: "b", position: 1 }),
    ];
    let counter = 0;
    const rows = buildLadderFigureRows(
      "g1",
      3,
      validated,
      [550, 720, 900, 1150, 1400],
      () => `id-${++counter}`,
      () => "t0",
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.goal_id).toBe("g1");
      expect(row.generation).toBe(3);
      expect(row.created_at).toBe("t0");
    }
    expect(rows[0]).toMatchObject({ name: "a", rank: 550, position: 0 });
    expect(rows[1]).toMatchObject({ name: "b", rank: 720, position: 1 });
    expect(JSON.parse(rows[0]?.chat_profile_json ?? "{}")).toEqual({
      personality: "果断",
      activeHours: "清晨活跃",
      replyStyle: "简短命令式",
    });
  });
});

describe("buildLadderDisplayRows", () => {
  function figureRow(overrides: Partial<GoalLadderFigureRow> = {}) {
    return {
      name: "figure",
      age: 30,
      era: "era",
      occupation: "job",
      self_line: "line",
      rank: 500,
      ...overrides,
    };
  }

  it("merges the user's own row into the sorted list, rank ascending", () => {
    const figures = [figureRow({ name: "a", rank: 400 }), figureRow({ name: "b", rank: 700 })];
    const rows = buildLadderDisplayRows(figures, 550);
    expect(rows.map((row) => row.name)).toEqual(["a", "你", "b"]);
    expect(rows.find((row) => row.isUser)?.rank).toBe(550);
  });

  it("places the user's row first when they outrank every figure (smaller rank = better)", () => {
    const figures = [figureRow({ name: "a", rank: 900 })];
    const rows = buildLadderDisplayRows(figures, 50);
    expect(rows[0]?.isUser).toBe(true);
  });

  it("gives the user's own row null age/era/occupation/selfLine", () => {
    const rows = buildLadderDisplayRows([figureRow()], 10);
    const userRow = rows.find((row) => row.isUser);
    expect(userRow?.age).toBeNull();
    expect(userRow?.era).toBeNull();
    expect(userRow?.occupation).toBeNull();
    expect(userRow?.selfLine).toBeNull();
    expect(userRow?.name).toBe("你");
  });
});
