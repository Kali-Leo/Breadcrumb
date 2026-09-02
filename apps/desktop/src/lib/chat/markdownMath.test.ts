/**
 * Purpose: tests for math delimiter normalization — bracket→dollar conversion for block
 * and inline math, and code spans staying untouched.
 */
import { describe, expect, it } from "vitest";
import { normalizeMathDelimiters } from "./markdownMath";

describe("normalizeMathDelimiters", () => {
  it("converts block and inline LaTeX delimiters", () => {
    const input = "定义:\\[ f'(a)=\\lim_{h\\to 0}\\frac{f(a+h)-f(a)}{h} \\] 而 \\(x^2\\) 是平方。";
    const output = normalizeMathDelimiters(input);
    expect(output).toContain("$$\nf'(a)=\\lim_{h\\to 0}\\frac{f(a+h)-f(a)}{h}\n$$");
    expect(output).toContain("$x^2$");
    expect(output).not.toContain("\\[");
    expect(output).not.toContain("\\(");
  });

  it("leaves code spans untouched", () => {
    const input = "代码 `\\[not math\\]` 和\n```\n\\(also not\\)\n```\n之外 \\(y\\)。";
    const output = normalizeMathDelimiters(input);
    expect(output).toContain("`\\[not math\\]`");
    expect(output).toContain("\\(also not\\)");
    expect(output).toContain("$y$");
  });

  it("returns plain text unchanged", () => {
    expect(normalizeMathDelimiters("没有公式的普通句子。")).toBe("没有公式的普通句子。");
  });
});
