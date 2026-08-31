/**
 * Purpose: the mirror modules pick sentences without writing them (spec 058 §2). These check
 * the picking: which catalogue key each situation maps to, and that the values the sentence
 * needs actually travel with it. The wording itself, and the pressure-lexicon gate over it,
 * live with the catalogues in apps/desktop.
 */
import { describe, expect, it } from "vitest";
import { activityMessage, heatmapCellMessage } from "./uiCopy";

describe("activityMessage", () => {
  it("carries cumulative active days only — no run or streak clause exists to carry", () => {
    expect(activityMessage(10)).toEqual({ key: "palace:mirror.activeDays", params: { count: 10 } });
    expect(activityMessage(0)).toEqual({ key: "palace:mirror.activeDays", params: { count: 0 } });
  });
});

describe("heatmapCellMessage", () => {
  it("states the count on a day that had one", () => {
    expect(heatmapCellMessage("2026-08-12", 3)).toEqual({
      key: "palace:mirror.heatmapCell",
      params: { date: "2026-08-12", count: 3 },
    });
  });

  it("says only the date on an empty day, never 'you did 0'", () => {
    expect(heatmapCellMessage("2026-08-05", 0)).toEqual({
      key: "palace:mirror.heatmapCellEmpty",
      params: { date: "2026-08-05" },
    });
  });
});
