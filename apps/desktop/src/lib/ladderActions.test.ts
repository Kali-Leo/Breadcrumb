/**
 * Purpose: unit tests for the pure ladder helpers — domain-label sampling, row shaping from a
 * validated generation, and the user-row merge/sort for inline display. No LLM/DB involved
 * (requestLadderGeneration is exercised only via typecheck — it's a thin chatJson +
 * recordMeteredCall wrapper mirroring requestGoalMapping).
 */
import type { GoalLadderRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import {
  progressFromRank,
  rankFromProgress,
  type ValidatedLadderFigure,
} from "@breadcrumb/plugin-planner";
import { describe, expect, it } from "vitest";
import {
  buildLadderDisplayRows,
  buildLadderRows,
  pickDomainLabelsSample,
  rankProgressFraction,
} from "./ladderActions";

function node(id: string, label: string): KnowledgeNodeRow {
  return { id, parent_id: null, label, summary: "", kind: "concept", created_at: "t" };
}

describe("pickDomainLabelsSample", () => {
  it("only includes goal nodes at or above the lit threshold", () => {
    const nodes = [node("a", "极限"), node("b", "导数"), node("c", "积分")];
    const goalMasteryByNode = new Map([
      ["a", 0.9],
      ["b", 0.2],
    ]);
    const sample = pickDomainLabelsSample(["a", "b"], nodes, goalMasteryByNode, 0.85, 10);
    expect(sample).toEqual(["极限"]);
  });

  it("excludes nodes outside the goal even if lit", () => {
    const nodes = [node("a", "极限"), node("outside", "无关知识点")];
    const goalMasteryByNode = new Map([
      ["a", 0.9],
      ["outside", 0.9],
    ]);
    const sample = pickDomainLabelsSample(["a"], nodes, goalMasteryByNode, 0.85, 10);
    expect(sample).toEqual(["极限"]);
  });

  it("caps at the given limit", () => {
    const nodes = ["a", "b", "c"].map((id) => node(id, id));
    const goalMasteryByNode = new Map([
      ["a", 0.9],
      ["b", 0.9],
      ["c", 0.9],
    ]);
    const sample = pickDomainLabelsSample(["a", "b", "c"], nodes, goalMasteryByNode, 0.85, 2);
    expect(sample).toHaveLength(2);
  });
});

function validatedFigure(overrides: Partial<ValidatedLadderFigure> = {}): ValidatedLadderFigure {
  return {
    name: "拿破仑",
    age: 24,
    era: "18世纪末",
    occupation: "军官",
    selfLine: "土伦港的炮位还记得我",
    isFamous: true,
    chatProfile: { personality: "果断", activeHours: "清晨活跃", replyStyle: "简短命令式" },
    position: 0,
    ...overrides,
  };
}

describe("buildLadderRows", () => {
  it("stamps every row with the same generation and user rank, anchored to its slot rank", () => {
    const validated = [
      validatedFigure({ name: "a", position: 0 }),
      validatedFigure({ name: "b", position: 1, isFamous: false }),
    ];
    let counter = 0;
    const rows = buildLadderRows(
      "g1",
      3,
      1000,
      validated,
      [550, 720, 900, 1150, 1400],
      () => `id-${++counter}`,
      () => "t0",
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.goal_id).toBe("g1");
      expect(row.generation).toBe(3);
      expect(row.user_rank_at_generation).toBe(1000);
      expect(row.created_at).toBe("t0");
    }
    expect(rows[0]).toMatchObject({ name: "a", rank: 550, is_famous: 1, position: 0 });
    expect(rows[1]).toMatchObject({ name: "b", rank: 720, is_famous: 0, position: 1 });
    expect(JSON.parse(rows[0]?.chat_profile_json ?? "{}")).toEqual({
      personality: "果断",
      activeHours: "清晨活跃",
      replyStyle: "简短命令式",
    });
  });
});

describe("buildLadderDisplayRows", () => {
  function figureRow(overrides: Partial<GoalLadderRow> = {}) {
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

describe("rankProgressFraction", () => {
  it("is 0 right at the bottom of the current rank's bracket and 1 right at the top", () => {
    const userRank = 500;
    const lower = progressFromRank(userRank);
    const upper = progressFromRank(userRank - 1);
    expect(rankProgressFraction(lower, userRank)).toBeCloseTo(0, 5);
    expect(rankProgressFraction(upper, userRank)).toBeCloseTo(1, 5);
  });

  it("rises monotonically within a rank bracket", () => {
    const userRank = 500;
    const lower = progressFromRank(userRank);
    const upper = progressFromRank(userRank - 1);
    const mid = (lower + upper) / 2;
    expect(rankProgressFraction(mid, userRank)).toBeGreaterThan(
      rankProgressFraction(lower, userRank),
    );
    expect(rankProgressFraction(upper, userRank)).toBeGreaterThan(
      rankProgressFraction(mid, userRank),
    );
  });

  it("never returns outside [0,1] even for out-of-bracket progress", () => {
    expect(rankProgressFraction(0, 500)).toBeGreaterThanOrEqual(0);
    expect(rankProgressFraction(1000, 500)).toBeLessThanOrEqual(1);
  });

  it("is maxed out at rank 1 (no better rank to progress toward)", () => {
    expect(rankProgressFraction(99, 1)).toBe(1);
  });

  it("agrees with rankFromProgress: a progress value mapping to a given rank falls in [0,1] for that rank", () => {
    const m = 55;
    const rank = rankFromProgress(m);
    const fraction = rankProgressFraction(m, rank);
    expect(fraction).toBeGreaterThanOrEqual(0);
    expect(fraction).toBeLessThanOrEqual(1);
  });
});
