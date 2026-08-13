/**
 * Purpose: pressure-lexicon gate over every user-visible feedback-lab string (spec 035
 * acceptance 5) — FEEDBACK_COPY's static values plus a representative sample of every
 * template function's output must scan clean, and none of it may contain praise words.
 */
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
} from "@breadcrumb/plugin-feedback";
import { describe, expect, it } from "vitest";
import { findPressureLexiconHits, loadPressureLexicon } from "./pressureLexicon";

const PRAISE_WORDS = ["真棒", "太棒", "厉害", "加油", "优秀", "了不起", "真聪明"];

describe("feedback lab copy gates", () => {
  const lexicon = loadPressureLexicon();
  const allCopy = [
    ...Object.values(FEEDBACK_COPY),
    // continuityLine: currentRun 0 (no clause) and 5 (clause appended).
    continuityLine(0, 0, 0),
    continuityLine(12, 6, 5),
    // reunionLine: representative waiting/invite counts.
    reunionLine(7, 3),
    reunionLine(0, 0),
    // dailyBiteLine: zero progress, partial progress, complete.
    dailyBiteLine(0, 0, 3, 1),
    dailyBiteLine(1, 0, 3, 1),
    dailyBiteLine(3, 1, 3, 1),
    // gaugeLine: representative target/measured percentages.
    gaugeLine(90, 82),
    gaugeLine(90, 90),
    // small-wins labels: every kind.
    newConceptLabel("递归"),
    reencounterLabel("闭包"),
    wordGuessLabel("book", false),
    wordGuessLabel("book", true),
    teachSessionLabel("闭包入门"),
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
