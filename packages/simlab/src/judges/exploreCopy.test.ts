/**
 * Purpose: pressure-lexicon gate over every user-visible explore-doors/selection-bar/focus-
 * session string (spec 039 acceptance 9; spec 042 §7) — EXPLORE_UI_COPY's static values plus a
 * representative sample of every template function's output must scan clean, and none of it
 * may contain praise words.
 */
import {
  buildFocusRecordText,
  conceptDirectRevealLine,
  doorExpandPrefill,
  EXPLORE_UI_COPY,
  FOCUS_SYSTEM_PROMPT,
  focusErrorLine,
  focusSelectHint,
  frontierStopPrefill,
  guessFeedbackLine,
  selectionDiscussPrefill,
  selectionExplainPrefill,
  transferListTitle,
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
    transferListTitle("闭包"),
    FOCUS_SYSTEM_PROMPT,
    buildFocusRecordText("闭包", [
      { id: "root", parentId: null, kind: "word", label: "闭包" },
      { id: "n2", parentId: "root", kind: "word", label: "词法环境" },
      { id: "n3", parentId: "n2", kind: "question", label: "为什么会内存泄漏" },
    ]),
    focusSelectHint("词法环境"),
    focusErrorLine("网络请求超时"),
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
