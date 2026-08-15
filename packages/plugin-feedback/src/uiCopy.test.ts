/**
 * Purpose: unit tests for the mirror-module copy templates — exact output strings for the
 * activity line, the small-wins label variants, and every mastery-claim label. The
 * pressure-lexicon/praise-word gate itself lives in simlab's feedbackCopy.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  activityLine,
  evidenceClaimLabel,
  newConceptLabel,
  reencounterLabel,
  reunionOpener,
  teachSessionLabel,
  wordGuessLabel,
} from "./uiCopy";

describe("activityLine", () => {
  it("states cumulative active days only — no run or streak clauses", () => {
    expect(activityLine(10)).toBe("活跃 10 天");
    expect(activityLine(0)).toBe("活跃 0 天");
  });
});

describe("small-wins labels", () => {
  it("labels a first meeting", () => {
    expect(newConceptLabel("闭包")).toBe("新认识:闭包");
  });

  it("labels a re-encounter", () => {
    expect(reencounterLabel("闭包")).toBe("重逢:闭包");
  });

  it("labels word guesses by closeness", () => {
    expect(wordGuessLabel("closure", false)).toBe("词汇:「closure」猜对了");
    expect(wordGuessLabel("closure", true)).toBe("词汇:「closure」接近了");
  });

  it("labels a teach-back session", () => {
    expect(teachSessionLabel("闭包")).toBe("回讲了一次:闭包");
  });
});

describe("reunionOpener", () => {
  it("seeds the chat with the concept name and an open invitation", () => {
    expect(reunionOpener("闭包")).toContain("「闭包」");
  });
});

describe("evidenceClaimLabel", () => {
  it("maps every claim level to a plain first-person-anchored fact", () => {
    expect(evidenceClaimLabel("learned")).toBe("你说过:这个学过");
    expect(evidenceClaimLabel("familiar")).toBe("你说过:这个比较熟");
    expect(evidenceClaimLabel("taught_principled")).toBe("你讲过它的原理");
    expect(evidenceClaimLabel("taught_surface")).toBe("你把它复述过一遍");
  });
});
