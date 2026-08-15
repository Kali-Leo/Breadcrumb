/**
 * Purpose: pressure-lexicon gate over every user-visible mirror-module string (spec 035
 * acceptance 5; surface graduated by spec 046) — FEEDBACK_COPY's static values plus a
 * representative sample of every template function's output must scan clean, and none of
 * it may contain praise words.
 */
import {
  activityLine,
  evidenceClaimLabel,
  FEEDBACK_COPY,
  newConceptLabel,
  reencounterLabel,
  reunionOpener,
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
    // activityLine: zero and a representative count.
    activityLine(0),
    activityLine(12),
    // reunionOpener: the zero-LLM opener seeded into reunion chats.
    reunionOpener("黑洞"),
    // small-wins labels: every kind.
    newConceptLabel("递归"),
    reencounterLabel("闭包"),
    wordGuessLabel("book", false),
    wordGuessLabel("book", true),
    teachSessionLabel("闭包入门"),
    // evidence claim labels: every level.
    evidenceClaimLabel("learned"),
    evidenceClaimLabel("familiar"),
    evidenceClaimLabel("taught_principled"),
    evidenceClaimLabel("taught_surface"),
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
