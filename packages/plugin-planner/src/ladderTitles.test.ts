/**
 * Purpose: unit tests for the self-title ladder (spec 021) — monotonicity in fuel via the
 * rank scalar, the 19-step shape with correct division labels, threshold placement on the
 * ln(start/rank) axis, inherited never-drop/bounded-slip semantics, and the next-title hook.
 */
import { describe, expect, it } from "vitest";
import {
  LADDER_TITLE_TIERS,
  nextTitleLabel,
  TITLE_STEP_COUNT,
  TITLE_THRESHOLD_GROWTH,
  titleFromRank,
} from "./ladderTitles";
import { rankFromFuel, resolveShownRank, startRank } from "./rankEngine";

const START = startRank("goal-under-test");

/** The rank that sits exactly at progress p = ln(start/rank), i.e. rank = start·e^(−p). */
function rankAtProgress(progress: number): number {
  return Math.max(2, Math.round(START * Math.exp(-progress)));
}

describe("titleFromRank", () => {
  it("starts at the bottom step for a fresh goal (rank = start)", () => {
    const title = titleFromRank(START, START);
    expect(title.step).toBe(0);
    expect(title.label).toBe("青铜 III");
  });

  it("is monotone non-decreasing as fuel grows", () => {
    let previousStep = -1;
    for (let fuel = 0; fuel <= 400; fuel += 2) {
      const { step } = titleFromRank(rankFromFuel(fuel, START), START);
      expect(step).toBeGreaterThanOrEqual(previousStep);
      previousStep = step;
    }
  });

  it("walks all 19 steps in order: III→II→I per tier, undivided top", () => {
    const seenLabels: string[] = [];
    for (let step = 0; step < TITLE_STEP_COUNT; step++) {
      // Land just past each step's threshold on the progress axis.
      const threshold = TITLE_THRESHOLD_GROWTH ** step - 1;
      const title = titleFromRank(rankAtProgress(threshold + 0.001), START);
      if (seenLabels[seenLabels.length - 1] !== title.label) seenLabels.push(title.label);
    }
    expect(seenLabels).toEqual([
      "青铜 III",
      "青铜 II",
      "青铜 I",
      "白银 III",
      "白银 II",
      "白银 I",
      "黄金 III",
      "黄金 II",
      "黄金 I",
      "铂金 III",
      "铂金 II",
      "铂金 I",
      "钻石 III",
      "钻石 II",
      "钻石 I",
      "大师 III",
      "大师 II",
      "大师 I",
      "王者",
    ]);
  });

  it("stays strictly below a step's threshold until the threshold is crossed", () => {
    for (const step of [1, 5, 10, 18]) {
      const threshold = TITLE_THRESHOLD_GROWTH ** step - 1;
      expect(titleFromRank(rankAtProgress(threshold - 0.01), START).step).toBe(step - 1);
      expect(titleFromRank(rankAtProgress(threshold + 0.01), START).step).toBe(step);
    }
  });

  it("clamps out-of-range ranks instead of throwing", () => {
    expect(titleFromRank(START * 2, START).step).toBe(0);
    const top = titleFromRank(1, START);
    expect(top.label).toBe("王者");
    expect(top.division).toBeNull();
  });

  it("is deterministic", () => {
    expect(titleFromRank(40_000, START)).toEqual(titleFromRank(40_000, START));
  });
});

describe("title semantics inherited from resolveShownRank", () => {
  it("never drops a title while fuel keeps growing", () => {
    let lastShownRank = rankFromFuel(0, START);
    let lastViewFuel = 0;
    let previousStep = titleFromRank(lastShownRank, START).step;
    for (const fuel of [3, 7, 12, 20, 35, 60]) {
      const shown = resolveShownRank(fuel, START, { lastShownRank, lastViewFuel });
      const { step } = titleFromRank(shown, START);
      expect(step).toBeGreaterThanOrEqual(previousStep);
      previousStep = step;
      lastShownRank = shown;
      lastViewFuel = fuel;
    }
  });

  it("slips back at most one early step after a long absence (10% rank slip ≈ 0.095 progress)", () => {
    const lastViewFuel = 30;
    const lastShownRank = rankFromFuel(lastViewFuel, START);
    const before = titleFromRank(lastShownRank, START).step;
    const slipped = resolveShownRank(lastViewFuel * 0.5, START, { lastShownRank, lastViewFuel });
    const after = titleFromRank(slipped, START).step;
    expect(after).toBeGreaterThanOrEqual(before - 1);
  });
});

describe("nextTitleLabel", () => {
  it("names the next step up and returns null at the top", () => {
    expect(nextTitleLabel(titleFromRank(START, START))).toBe("青铜 II");
    expect(nextTitleLabel(titleFromRank(1, START))).toBeNull();
  });

  it("crosses tier boundaries correctly", () => {
    const bronzeOneThreshold = TITLE_THRESHOLD_GROWTH ** 2 - 1;
    const bronzeOne = titleFromRank(rankAtProgress(bronzeOneThreshold + 0.001), START);
    expect(bronzeOne.label).toBe("青铜 I");
    expect(nextTitleLabel(bronzeOne)).toBe("白银 III");
  });
});

describe("ladder shape", () => {
  it("has 7 tiers and 19 steps", () => {
    expect(LADDER_TITLE_TIERS).toHaveLength(7);
    expect(TITLE_STEP_COUNT).toBe(19);
  });
});
