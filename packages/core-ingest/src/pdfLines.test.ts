/**
 * Purpose: the guessing half of PDF import — which lines are chapter titles, and what the
 * extracted characters actually are. A PDF says neither, and getting either wrong is quiet:
 * the book imports, the search runs, and the answers are fragments under the wrong heading.
 */
import { describe, expect, it } from "vitest";
import { isScannedPage } from "./pdf";
import { groupIntoLines, inferHeadingLevels, linesToBlocks, pagesToBlocks } from "./pdfLines";

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

describe("pagesToBlocks", () => {
  const paragraph = (text: string) =>
    Array.from({ length: 6 }, () => ({ text: text.repeat(10), height: 10 }));

  it("names a recognized page after itself, under the heading the book had reached", () => {
    const blocks = pagesToBlocks(
      [
        { lines: [{ text: "第一章 时间", height: 18 }, ...paragraph("七十二除以利率。")] },
        { lines: [], recognized: { label: "第 2 页", lines: ["扫描出来的一行", "又一行"] } },
        { lines: paragraph("风险是波动。") },
      ],
      "复利入门",
    );
    expect(blocks.map((block) => block.headings)).toEqual([
      ["复利入门", "第一章 时间"],
      ["复利入门", "第一章 时间", "第 2 页"],
      ["复利入门", "第一章 时间"],
    ]);
    expect(blocks[1]?.text).toBe("扫描出来的一行\n又一行");
  });

  it("gives a book with no text layer one block per page under the book's name", () => {
    const blocks = pagesToBlocks(
      [
        { lines: [], recognized: { label: "第 1 页", lines: ["一"] } },
        { lines: [], recognized: { label: "第 2 页", lines: [] } },
        { lines: [], recognized: { label: "第 3 页", lines: ["三"] } },
      ],
      "扫描本",
    );
    // The empty page is not a block: there is nothing to find on it.
    expect(blocks.map((block) => block.headings)).toEqual([
      ["扫描本", "第 1 页"],
      ["扫描本", "第 3 页"],
    ]);
  });

  it("does not let a recognized page's lack of heights decide what body text is", () => {
    // A book that is mostly scans: the text-layer pages still get their headings.
    const blocks = pagesToBlocks(
      [
        { lines: [{ text: "第一章", height: 18 }, ...paragraph("正文。")] },
        ...Array.from({ length: 40 }, (_unused, index) => ({
          lines: [],
          recognized: { label: `第 ${index + 2} 页`, lines: ["扫"] },
        })),
      ],
      "书",
    );
    expect(blocks[0]?.headings).toEqual(["书", "第一章"]);
  });
});

describe("isScannedPage", () => {
  it("treats a page number or a running head as no text layer at all", () => {
    expect(isScannedPage([{ text: "12", height: 8 }])).toBe(true);
    expect(isScannedPage([{ text: "第三章 复利", height: 8 }])).toBe(true);
    expect(isScannedPage([])).toBe(true);
  });

  it("keeps a page that has a paragraph on it", () => {
    expect(
      isScannedPage([{ text: "七十二除以年利率，就是本金翻倍所需要的年数。", height: 10 }]),
    ).toBe(false);
  });
});
