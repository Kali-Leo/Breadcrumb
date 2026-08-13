/**
 * Purpose: unit tests for the feedback-lab copy templates — exact output strings for every
 * boundary the spec calls out (currentRun 0/2, dailyBite zero/partial/complete, and the
 * small-wins label variants). The pressure-lexicon/praise-word gate itself lives in
 * simlab's feedbackCopy.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  continuityLine,
  dailyBiteLine,
  FEEDBACK_COPY,
  gaugeLine,
  newConceptLabel,
  reencounterLabel,
  reunionLine,
  teachSessionLabel,
  wordGuessLabel,
} from "./uiCopy";

describe("continuityLine", () => {
  it("omits the current-run clause when currentRunDays is 0", () => {
    expect(continuityLine(10, 5, 0)).toBe("活跃 10 天 · 最长连续 5 天");
  });

  it("omits the current-run clause when currentRunDays is 1", () => {
    expect(continuityLine(10, 5, 1)).toBe("活跃 10 天 · 最长连续 5 天");
  });

  it("appends the current-run clause once currentRunDays reaches 2", () => {
    expect(continuityLine(10, 5, 2)).toBe("活跃 10 天 · 最长连续 5 天 · 目前连续 2 天");
  });

  it("appends the current-run clause for a longer streak", () => {
    expect(continuityLine(30, 12, 5)).toBe("活跃 30 天 · 最长连续 12 天 · 目前连续 5 天");
  });
});

describe("reunionLine", () => {
  it("states waiting count and invite count", () => {
    expect(reunionLine(7, 3)).toBe("有 7 个概念到了重逢的时候,从这 3 个开始即可。");
  });
});

describe("dailyBiteLine", () => {
  it("returns the complete copy once both targets are met", () => {
    expect(dailyBiteLine(3, 1, 3, 1)).toBe(FEEDBACK_COPY.dailyBiteComplete);
  });

  it("states the full target when nothing is done yet", () => {
    expect(dailyBiteLine(0, 0, 3, 1)).toBe("今天的一份:重逢 3 个 + 新认识 1 个。");
  });

  it("states done and remaining for partial progress", () => {
    expect(dailyBiteLine(1, 0, 3, 1)).toBe("已完成 1 · 还剩 3。");
  });
});

describe("gaugeLine", () => {
  it("states target and measured percentages", () => {
    expect(gaugeLine(90, 82)).toBe("目标记住率 90%,近 30 天实测 82%。");
  });
});

describe("small-wins labels", () => {
  it("labels a new concept", () => {
    expect(newConceptLabel("递归")).toBe("新认识:递归");
  });

  it("labels a reencounter", () => {
    expect(reencounterLabel("递归")).toBe("重逢:递归");
  });

  it("labels a correct word guess", () => {
    expect(wordGuessLabel("book", false)).toBe("词汇:「book」猜对了");
  });

  it("labels a close word guess", () => {
    expect(wordGuessLabel("book", true)).toBe("词汇:「book」接近了");
  });

  it("labels a teach session", () => {
    expect(teachSessionLabel("闭包入门")).toBe("回讲了一次:闭包入门");
  });
});
