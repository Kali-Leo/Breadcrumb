/**
 * Purpose: unit tests for the length budget — the rule a prompt states must name both script
 * families (a hanzi count alone is what broke every non-Chinese caller), and the derived
 * ceiling must fit a real non-CJK answer without accepting a paragraph.
 */
import { describe, expect, it } from "vitest";
import { lengthRule, maxCharsFor } from "./lengthBudget";

describe("lengthRule", () => {
  it("states the budget for both script families", () => {
    const rule = lengthRule({ cjkChars: 40, words: 20 });
    expect(rule).toContain("40 个字");
    expect(rule).toContain("20 个词");
  });

  it("names no single language as the one to answer in", () => {
    // The answer language comes from buildLanguageDirective; a prompt that names one too
    // is the bug this module exists to prevent.
    expect(lengthRule({ cjkChars: 12, words: 4 })).not.toMatch(/用中文|平实中文/);
  });
});

describe("maxCharsFor", () => {
  it("leaves room for the same sentence in a script that runs long", () => {
    // "Yesterday you worked out how transits reveal exoplanets and how a promise chain
    // sequences asynchronous steps." — 110 characters, well inside a 20-word budget.
    expect(maxCharsFor({ cjkChars: 40, words: 20 })).toBeGreaterThan(110);
  });

  it("still refuses a paragraph in a one-sentence field", () => {
    expect(maxCharsFor({ cjkChars: 40, words: 20 })).toBeLessThan(400);
  });

  it("never falls below the CJK character budget itself", () => {
    expect(maxCharsFor({ cjkChars: 200, words: 2 })).toBe(200);
  });
});
