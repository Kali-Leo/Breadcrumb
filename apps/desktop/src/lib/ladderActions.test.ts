/**
 * Purpose: unit tests for the pure ladder helpers — domain-label sampling, row shaping from a
 * validated generation, the user-row merge/sort for inline display, and the distance-to-top
 * band line. No LLM/DB involved (requestLadderGeneration is exercised only via typecheck —
 * it's a thin chatJson + recordMeteredCall wrapper mirroring requestGoalMapping).
 */
import type { GoalLadderRow, KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { ValidatedLadderFigure } from "@breadcrumb/plugin-planner";
import { describe, expect, it } from "vitest";
import {
  buildLadderDisplayRows,
  buildLadderRows,
  distanceToTopBand,
  pickDomainLabelsSample,
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

describe("buildLadderRows", () => {
  it("stamps every row with the same generation and user milestone", () => {
    const validated: ValidatedLadderFigure[] = [
      { figureDesc: "a", figureNote: "na", milestone: 60, position: 0 },
      { figureDesc: "b", figureNote: "nb", milestone: 40, position: 1 },
    ];
    let counter = 0;
    const rows = buildLadderRows(
      "g1",
      3,
      45,
      validated,
      () => `id-${++counter}`,
      () => "t0",
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.goal_id).toBe("g1");
      expect(row.generation).toBe(3);
      expect(row.user_milestone_at_generation).toBe(45);
      expect(row.created_at).toBe("t0");
    }
    expect(rows[0]).toMatchObject({
      figure_desc: "a",
      figure_note: "na",
      milestone: 60,
      position: 0,
    });
  });
});

describe("buildLadderDisplayRows", () => {
  function figureRow(overrides: Partial<GoalLadderRow> = {}) {
    return {
      figure_desc: "figure",
      figure_note: "note",
      milestone: 50,
      ...overrides,
    };
  }

  it("merges the user's own row into the sorted list, milestone descending", () => {
    const figures = [
      figureRow({ figure_desc: "a", milestone: 60 }),
      figureRow({ figure_desc: "b", milestone: 30 }),
    ];
    const rows = buildLadderDisplayRows(figures, 45);
    expect(rows.map((row) => row.label)).toEqual(["a", "你", "b"]);
    expect(rows.find((row) => row.isUser)?.milestoneValue).toBe(45);
  });

  it("places the user's row at the top when they outrank every figure", () => {
    const figures = [figureRow({ figure_desc: "a", milestone: 20 })];
    const rows = buildLadderDisplayRows(figures, 90);
    expect(rows[0]?.isUser).toBe(true);
  });

  it("gives the user's own row a null note", () => {
    const rows = buildLadderDisplayRows([figureRow()], 10);
    expect(rows.find((row) => row.isUser)?.note).toBeNull();
  });
});

describe("distanceToTopBand", () => {
  it("returns the gap to milestone 80", () => {
    expect(distanceToTopBand(60)).toBe(20);
  });

  it("floors at 0 once already at or past the top band", () => {
    expect(distanceToTopBand(80)).toBe(0);
    expect(distanceToTopBand(95)).toBe(0);
  });
});
