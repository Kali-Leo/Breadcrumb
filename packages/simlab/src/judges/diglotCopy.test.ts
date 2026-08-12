/**
 * Purpose: pressure-lexicon gate over every user-visible diglot string (spec 033
 * acceptance 6) — the guess feedback and all card/settings copy must scan clean, and the
 * feedback must not contain praise words even outside the lexicon.
 */
import { DIGLOT_UI_COPY, feedbackTextFor } from "@breadcrumb/plugin-diglot-weave";
import { describe, expect, it } from "vitest";
import { findPressureLexiconHits, loadPressureLexicon } from "./pressureLexicon";

const PRAISE_WORDS = ["真棒", "太棒", "厉害", "加油", "优秀", "了不起", "真聪明"];

describe("diglot copy gates", () => {
  const lexicon = loadPressureLexicon();
  const allCopy = [
    ...Object.values(DIGLOT_UI_COPY),
    feedbackTextFor("correct", "书本"),
    feedbackTextFor("close", "书本"),
    feedbackTextFor("wrong", "书本"),
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
