/**
 * Purpose: pressure-lexicon gate over every user-visible explore-doors/selection-bar string
 * (spec 039 acceptance 9) — EXPLORE_UI_COPY's static values plus a representative sample of
 * every template function's output must scan clean, and none of it may contain praise words.
 */
import {
  conceptDirectRevealLine,
  doorExpandPrefill,
  EXPLORE_UI_COPY,
  frontierStopPrefill,
  guessFeedbackLine,
  selectionDiscussPrefill,
  selectionExplainPrefill,
} from "@breadcrumb/plugin-explore";
import { describe, expect, it } from "vitest";
import { findPressureLexiconHits, loadPressureLexicon } from "./pressureLexicon";

const PRAISE_WORDS = ["真棒", "太棒", "厉害", "加油", "优秀", "了不起", "真聪明"];

describe("explore doors + selection bar copy gates", () => {
  const lexicon = loadPressureLexicon();
  const allCopy = [
    ...Object.values(EXPLORE_UI_COPY),
    conceptDirectRevealLine("闭包是函数与其词法环境的绑定。"),
    doorExpandPrefill("闭包"),
    selectionExplainPrefill("词法环境"),
    selectionDiscussPrefill("词法环境"),
    guessFeedbackLine("correct", "闭包是函数与其词法环境的绑定。"),
    guessFeedbackLine("close", "闭包是函数与其词法环境的绑定。"),
    guessFeedbackLine("wrong", "闭包是函数与其词法环境的绑定。"),
    frontierStopPrefill("词法环境"),
  ];

  it("hits zero pressure-lexicon entries", () => {
    for (const text of allCopy) {
      expect(findPressureLexiconHits(text, lexicon)).toEqual([]);
    }
  });

  it("contains no praise words (plain statements only)", () => {
    for (const text of allCopy) {
      for (const praise of PRAISE_WORDS) {
        expect(text).not.toContain(praise);
      }
    }
  });
});
