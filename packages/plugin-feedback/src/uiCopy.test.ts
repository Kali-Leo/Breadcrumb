/**
 * Purpose: the mirror modules pick sentences without writing them (spec 058 §2). These check
 * the picking: which catalogue key each situation maps to, and that the values the sentence
 * needs actually travel with it. The wording itself, and the pressure-lexicon gate over it,
 * live with the catalogues in apps/desktop.
 */
import { describe, expect, it } from "vitest";
import {
  activityMessage,
  evidenceClaimMessage,
  heatmapCellMessage,
  newConceptMessage,
  reencounterMessage,
  reunionOpenerMessage,
  teachSessionMessage,
  wordGuessMessage,
} from "./uiCopy";

describe("activityMessage", () => {
  it("carries cumulative active days only — no run or streak clause exists to carry", () => {
    expect(activityMessage(10)).toEqual({ key: "palace:mirror.activeDays", params: { count: 10 } });
    expect(activityMessage(0)).toEqual({ key: "palace:mirror.activeDays", params: { count: 0 } });
  });
});

describe("heatmapCellMessage", () => {
  it("states the day and its footprint count", () => {
    expect(heatmapCellMessage("2026-08-12", 3)).toEqual({
      key: "palace:mirror.heatmapCell",
      params: { date: "2026-08-12", count: 3 },
    });
  });

  it("says only the date for an empty day — absence is not narrated", () => {
    expect(heatmapCellMessage("2026-08-05", 0)).toEqual({
      key: "palace:mirror.heatmapCellEmpty",
      params: { date: "2026-08-05" },
    });
  });
});

describe("small-wins messages", () => {
  it("distinguishes a first meeting from a reencounter", () => {
    expect(newConceptMessage("闭包").key).toBe("palace:mirror.newConcept");
    expect(reencounterMessage("闭包").key).toBe("palace:mirror.reencounter");
    expect(newConceptMessage("闭包").params).toEqual({ title: "闭包" });
  });

  it("distinguishes a correct guess from a close one", () => {
    expect(wordGuessMessage("apple", false).key).toBe("palace:mirror.wordGuessCorrect");
    expect(wordGuessMessage("apple", true).key).toBe("palace:mirror.wordGuessClose");
    expect(wordGuessMessage("apple", true).params).toEqual({ word: "apple" });
  });

  it("carries the conversation title into the teach-back line", () => {
    expect(teachSessionMessage("递归")).toEqual({
      key: "palace:mirror.teachSession",
      params: { title: "递归" },
    });
  });
});

describe("reunionOpenerMessage", () => {
  it("carries the concept being revisited", () => {
    expect(reunionOpenerMessage("向量")).toEqual({
      key: "palace:mirror.reunionOpener",
      params: { title: "向量" },
    });
  });
});

describe("evidenceClaimMessage", () => {
  it("has one distinct key per claim level, and no two levels collide", () => {
    const levels = ["learned", "familiar", "taught_principled", "taught_surface"] as const;
    const keys = levels.map((level) => evidenceClaimMessage(level).key);
    expect(new Set(keys).size).toBe(levels.length);
    for (const key of keys) {
      expect(key.startsWith("palace:mirror.evidenceClaim")).toBe(true);
    }
  });
});
