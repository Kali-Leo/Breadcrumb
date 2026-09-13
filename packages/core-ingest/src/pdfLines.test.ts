/**
 * Purpose: the guessing half of PDF import — which lines are chapter titles, and what the
 * extracted characters actually are. A PDF says neither, and getting either wrong is quiet:
 * the book imports, the search runs, and the answers are fragments under the wrong heading.
 */
import { describe, expect, it } from "vitest";
import { groupIntoLines, inferHeadingLevels, linesToBlocks } from "./pdfLines";

const item = (text: string, height: number, y: number) => ({ text, height, y });

describe("groupIntoLines", () => {
  it("joins the glyph runs that sit on one baseline", () => {
    const lines = groupIntoLines([item("复利", 10, 700), item("入门", 10, 700.5)]);
    expect(lines).toEqual([{ text: "复利入门", height: 10 }]);
  });

  it("starts a new line when the baseline moves", () => {
    const lines = groupIntoLines([item("第一行", 10, 700), item("第二行", 10, 680)]);
    expect(lines.map((line) => line.text)).toEqual(["第一行", "第二行"]);
  });

  it("repairs the characters a CJK font substitutes on the way out", () => {
    // ⽂ (U+2F2C, a Kangxi radical) is what pdf.js hands back where 文 was typeset. It is a
    // symbol rather than a letter, so it ends a word for every tokenizer that meets it — and
    // it is what the reader would see quoted back at them.
    expect(groupIntoLines([item("中⽂测试⽂集", 10, 700)])[0]?.text).toBe("中文测试文集");
  });

  it("drops the blank runs a PDF is full of", () => {
    expect(groupIntoLines([item("  ", 10, 700), item("正文", 10, 700)])).toHaveLength(1);
  });
});

describe("inferHeadingLevels", () => {
  const body = Array.from({ length: 20 }, () => ({ text: "普通正文".repeat(20), height: 10 }));

  it("calls the most common height body text and the taller short lines headings", () => {
    const lines = [{ text: "第一章", height: 18 }, { text: "1.1 小节", height: 14 }, ...body];
    expect(inferHeadingLevels(lines).slice(0, 3)).toEqual([1, 2, 0]);
  });

  it("does not promote a long line just because it is large", () => {
    const pullQuote = { text: "这是一个很长的句子".repeat(12), height: 18 };
    expect(inferHeadingLevels([pullQuote, ...body])[0]).toBe(0);
  });

  it("has no headings in a document typeset all one size", () => {
    expect(inferHeadingLevels(body).every((level) => level === 0)).toBe(true);
  });
});

describe("linesToBlocks", () => {
  it("puts the book's name outermost and the headings under it, in order", () => {
    // Enough body lines for "most common height" to mean something — which is also what a
    // real page looks like, and why the rule works at all.
    const paragraph = (text: string) =>
      Array.from({ length: 6 }, () => ({ text: text.repeat(10), height: 10 }));
    const blocks = linesToBlocks(
      [
        { text: "第一章 时间", height: 18 },
        { text: "1.1 七二法则", height: 14 },
        ...paragraph("七十二除以利率。"),
        { text: "第二章 风险", height: 18 },
        ...paragraph("风险是波动。"),
      ],
      "复利入门",
    );
    expect(blocks.map((block) => block.headings)).toEqual([
      ["复利入门", "第一章 时间", "1.1 七二法则"],
      ["复利入门", "第二章 风险"],
    ]);
  });

  it("keeps a document with no headings as one block under its own name", () => {
    const blocks = linesToBlocks([{ text: "只有正文。".repeat(20), height: 10 }], "笔记");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.headings).toEqual(["笔记"]);
  });
});
