/**
 * Purpose: the two claims chunking makes — that a passage is cut where a reader would cut it,
 * and that the heading path travels with it. Both fail silently: a book cut mid-sentence still
 * imports, still indexes, still returns results, and every one of those results is a fragment.
 */
import { describe, expect, it } from "vitest";
import {
  CHILD_TOKENS,
  chunkBlocks,
  headingPathOf,
  PARENT_TOKENS,
  splitToSize,
  withHeadingPath,
} from "./chunking";
import { parseMarkdown, titleFromMarkdown } from "./markdown";
import { estimateTokens } from "./tokenEstimate";

describe("estimateTokens", () => {
  it("counts Chinese near one token a character and Latin near one per four", () => {
    expect(estimateTokens("复利是什么")).toBe(5);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  it("counts a mixed sentence as the sum of its parts, not as its character count", () => {
    expect(estimateTokens("复利 compound")).toBe(2 + Math.ceil(9 / 4));
  });
});

describe("splitToSize", () => {
  it("leaves text that already fits alone", () => {
    expect(splitToSize("短句。", 100)).toEqual(["短句。"]);
  });

  it("prefers paragraph breaks over sentence breaks", () => {
    const text = `${"甲".repeat(80)}。\n\n${"乙".repeat(80)}。`;
    expect(splitToSize(text, 100)).toEqual([`${"甲".repeat(80)}。`, `${"乙".repeat(80)}。`]);
  });

  it("falls back to sentence endings when a paragraph is still too long", () => {
    const pieces = splitToSize(`${"甲".repeat(70)}。${"乙".repeat(70)}。`, 100);
    expect(pieces).toHaveLength(2);
    expect(pieces.every((piece) => piece.endsWith("。"))).toBe(true);
  });

  it("splits English on sentences, not in the middle of words", () => {
    const sentence = `${"word ".repeat(60)}. `;
    for (const piece of splitToSize(sentence + sentence, 100)) {
      expect(piece).not.toMatch(/\bwor\b|\bord\b/);
    }
  });

  it("still obeys the limit when the text has no boundaries at all", () => {
    for (const piece of splitToSize("甲".repeat(500), 100)) {
      expect(estimateTokens(piece)).toBeLessThanOrEqual(100);
    }
  });

  it("glues neighbours back together rather than returning one sentence per chunk", () => {
    expect(splitToSize("一。二。三。四。", 100)).toEqual(["一。二。三。四。"]);
  });

  it("has nothing to split in whitespace", () => {
    expect(splitToSize("   \n\n  ", 100)).toEqual([]);
  });
});

describe("heading paths", () => {
  it("reads as 书名 → 章 → 节", () => {
    expect(headingPathOf(["复利入门", "第三章 时间", "3.2 七二法则"])).toBe(
      "复利入门 → 第三章 时间 → 3.2 七二法则",
    );
  });

  it("drops levels the document never named instead of leaving empty arrows", () => {
    expect(headingPathOf(["书名", "", "小节"])).toBe("书名 → 小节");
  });

  it("prepends the path to the text that gets indexed", () => {
    // The passage itself never says what it is about; this is what makes it findable.
    expect(withHeadingPath("书 → 章", "它大约每 18 个月翻一倍。")).toBe(
      "书 → 章\n它大约每 18 个月翻一倍。",
    );
    expect(withHeadingPath("", "text")).toBe("text");
  });
});

describe("chunkBlocks", () => {
  const source = [
    "# 复利入门",
    "前言段落。",
    "## 第三章 时间",
    "### 3.2 七二法则",
    `${"利".repeat(900)}。`,
    "## 第四章 风险",
    "短短一节。",
  ].join("\n\n");

  it("gives every child its parent's heading path", () => {
    const chunked = chunkBlocks(parseMarkdown(source, titleFromMarkdown(source, "file.md")));
    const deep = chunked.find((chunk) => chunk.parent.headingPath.includes("七二法则"));
    expect(deep?.parent.headingPath).toBe("复利入门 → 第三章 时间 → 3.2 七二法则");
    for (const child of deep?.children ?? []) {
      expect(child.headingPath).toBe(deep?.parent.headingPath);
    }
  });

  it("keeps parents at the size the model reads and children at the size the index sees", () => {
    for (const chunk of chunkBlocks(parseMarkdown(source, "复利入门"))) {
      expect(chunk.parent.tokens).toBeLessThanOrEqual(
        PARENT_TOKENS + chunk.parent.headingPath.length,
      );
      expect(chunk.children.length).toBeGreaterThan(0);
      for (const child of chunk.children) {
        expect(estimateTokens(child.text)).toBeLessThanOrEqual(CHILD_TOKENS);
      }
    }
  });

  it("never lets one parent span two sections", () => {
    const chunked = chunkBlocks(parseMarkdown(source, "复利入门"));
    const paths = chunked.map((chunk) => chunk.parent.headingPath);
    expect(paths).toContain("复利入门 → 第四章 风险");
    expect(paths.every((path) => !path.includes("第三章 时间 → 第四章"))).toBe(true);
  });

  it("reassembles into the original text, so nothing is silently dropped", () => {
    const chunked = chunkBlocks([{ headings: ["书"], text: "一。二。三。" }]);
    expect(chunked.flatMap((chunk) => chunk.children.map((child) => child.text)).join("")).toBe(
      "一。二。三。",
    );
  });
});

describe("parseMarkdown", () => {
  it("takes the document's own title when it declares one", () => {
    expect(titleFromMarkdown("# 复利入门\n\n正文", "file.md")).toBe("复利入门");
    expect(titleFromMarkdown("正文\n\n# 后面的标题", "file.md")).toBe("file.md");
  });

  it("does not mistake a comment inside a code fence for a chapter", () => {
    const blocks = parseMarkdown("# 书\n\n```sh\n# not a heading\n```\n", "书");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.headings).toEqual(["书"]);
    expect(blocks[0]?.text).toContain("# not a heading");
  });

  it("leaves a heading too deep to be a path in the body rather than losing it", () => {
    const blocks = parseMarkdown("# 书\n\n#### 很深的小标题\n\n正文", "书");
    expect(blocks.at(-1)?.text).toContain("#### 很深的小标题");
  });

  it("treats plain text as one block under the document's name", () => {
    const blocks = parseMarkdown("就是一段普通文字。", "笔记.txt");
    expect(blocks).toEqual([{ headings: ["笔记.txt"], text: "就是一段普通文字。" }]);
  });
});
