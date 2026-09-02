/**
 * Purpose: tests for ICU tokenization — CJK dictionary segmentation, clause indexing for
 * the dispersion rule, and word counting (spec 033).
 */
import { describe, expect, it } from "vitest";
import { clauseTextOf, countWordLikeTokens, tokenizeMessage } from "./tokenize";

describe("tokenizeMessage", () => {
  it("segments space-free Chinese into dictionary words", () => {
    const tokens = tokenizeMessage("我喜欢朋友", "zh");
    const words = tokens.filter((token) => token.isWordLike).map((token) => token.text);
    expect(words).toContain("喜欢");
    expect(words).toContain("朋友");
  });

  it("advances the clause index on CJK and Latin clause breakers", () => {
    const tokens = tokenizeMessage("你好,朋友。再见", "zh");
    const lastToken = tokens[tokens.length - 1];
    expect(lastToken?.clauseIndex).toBe(2);
    const first = tokens[0];
    expect(first?.clauseIndex).toBe(0);
  });

  it("keeps offsets addressable back into the original string", () => {
    const message = "I like books.";
    const tokens = tokenizeMessage(message, "en");
    for (const token of tokens) {
      expect(message.slice(token.start, token.end)).toBe(token.text);
    }
  });

  it("counts only word-like tokens", () => {
    expect(countWordLikeTokens(tokenizeMessage("one, two three!", "en"))).toBe(3);
  });
});

describe("clauseTextOf", () => {
  it("returns the clause a word stood in, not the whole message", () => {
    const message = "闭包很有用。递归也是一种基本思路。";
    const tokens = tokenizeMessage(message, "zh");
    const first = clauseTextOf(message, tokens, 0);
    const second = clauseTextOf(message, tokens, 1);
    expect(first).toContain("闭包");
    expect(first).not.toContain("递归");
    expect(second).toContain("递归");
    expect(second).not.toContain("闭包");
  });

  it("handles English sentence breaks the same way", () => {
    const message = "Closures capture scope. Recursion needs a base case.";
    const tokens = tokenizeMessage(message, "en");
    expect(clauseTextOf(message, tokens, 0)).toContain("Closures");
    expect(clauseTextOf(message, tokens, 0)).not.toContain("Recursion");
  });

  it("has nothing to return for a clause index that never occurred", () => {
    const message = "One clause only";
    expect(clauseTextOf(message, tokenizeMessage(message, "en"), 7)).toBe("");
  });
});
