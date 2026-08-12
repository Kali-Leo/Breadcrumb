/**
 * Purpose: unit tests for the three-stage ladder title contract (spec 032) — rung prompt
 * carries the snapshot, ladder validation rejects duplicates/forbidden content, the display
 * window clamps into 2..9, and composition appends the identity verbatim.
 */
import { describe, expect, it } from "vitest";
import {
  buildRungAssessmentMessages,
  buildTitleLadderMessages,
  composeLadderTitles,
  displayWindow,
  type TitleLadderResult,
  validateTitleLadder,
} from "./ladderAssessment";

function ladder(overrides: Partial<TitleLadderResult> = {}): TitleLadderResult {
  return {
    identity: "厨师",
    rungs: [
      "还没进厨房的",
      "锅都没摸热的",
      "切了一筐土豆的",
      "初闻油香的",
      "掌勺半桌的",
      "薛定谔火候的",
      "宴过三巡的",
      "百菜不重样的",
      "绝世掌勺",
      "万宴归一大",
    ],
    ...overrides,
  };
}

describe("buildRungAssessmentMessages", () => {
  it("carries the goal and both lists, and asks for a bare rung", () => {
    const messages = buildRungAssessmentMessages({
      goalTitle: "学会做饭",
      learnedItems: [{ label: "刀工", freshness: "熟" }],
      notYetLabels: ["高汤"],
    });
    const joined = messages.map((message) => message.content).join("\n");
    expect(joined).toContain("学会做饭");
    expect(joined).toContain("刀工");
    expect(joined).toContain("高汤");
    expect(joined).toContain('"rung"');
  });
});

describe("buildTitleLadderMessages", () => {
  it("carries the goal and the style exemplar without leaking learner content", () => {
    const messages = buildTitleLadderMessages("学会做饭");
    const joined = messages.map((message) => message.content).join("\n");
    expect(joined).toContain("学会做饭");
    expect(joined).toContain("绝世欧皇");
    expect(joined).not.toContain("刀工");
  });
});

describe("validateTitleLadder", () => {
  it("accepts a clean ladder", () => {
    expect(validateTitleLadder(ladder())).not.toBeNull();
  });

  it("rejects duplicate rungs", () => {
    const rungs = [...ladder().rungs];
    rungs[3] = rungs[7] as string;
    expect(validateTitleLadder(ladder({ rungs }))).toBeNull();
  });

  it("rejects forbidden vocabulary — luck memes, game tiers, digits, AI reveal", () => {
    for (const bad of ["绝世欧皇", "永恒钻石", "第3档的", "AI认证的"]) {
      const rungs = [...ladder().rungs];
      rungs[0] = bad;
      expect(validateTitleLadder(ladder({ rungs }))).toBeNull();
    }
  });

  it("rejects a rung that smuggles the identity noun in", () => {
    const rungs = [...ladder().rungs];
    rungs[5] = "厨师中的";
    expect(validateTitleLadder(ladder({ rungs }))).toBeNull();
  });
});

describe("displayWindow", () => {
  it("keeps three distinct rungs at both extremes", () => {
    expect(displayWindow(1)).toEqual({ above: 3, self: 2, below: 1 });
    expect(displayWindow(10)).toEqual({ above: 10, self: 9, below: 8 });
    expect(displayWindow(5)).toEqual({ above: 6, self: 5, below: 4 });
  });
});

describe("composeLadderTitles", () => {
  it("appends the identity verbatim to the windowed rungs", () => {
    const titles = composeLadderTitles(ladder(), 5);
    expect(titles.selfTitle).toBe("掌勺半桌的厨师");
    expect(titles.aboveTitle).toBe("薛定谔火候的厨师");
    expect(titles.belowTitle).toBe("初闻油香的厨师");
  });
});
