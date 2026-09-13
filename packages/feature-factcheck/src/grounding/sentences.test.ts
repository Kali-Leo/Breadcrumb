import { describe, expect, it } from "vitest";
import { maskMarkdown, splitSentences } from "./sentences";

describe("maskMarkdown", () => {
  it("is exactly as long as its input, so an index into one is an index into the other", () => {
    for (const source of [
      "讲解在这里。\n```js\nconst a = 8848;\n```\n后面继续。",
      "- **珠穆朗玛峰**的高度见 [维基](https://example.org)。",
      "# 标题\n> 引用一句\n| a | b |\n普通一句话。",
      "行内 `code` 和 *强调* 混在一起。",
    ]) {
      expect(maskMarkdown(source).length).toBe(source.length);
    }
  });

  it("blanks fenced code, which is never prose to check", () => {
    expect(maskMarkdown("讲解在这里。\n```js\nconst a = 8848;\n```\n后面继续。")).not.toContain(
      "8848",
    );
  });

  it("keeps the words inside emphasis, links and list markers, where they were", () => {
    const source = "- **珠穆朗玛峰**的高度见 [维基](https://example.org)。";
    const masked = maskMarkdown(source);
    expect(masked).toContain("珠穆朗玛峰");
    expect(masked).toContain("维基");
    expect(masked.indexOf("珠穆朗玛峰")).toBe(source.indexOf("珠穆朗玛峰"));
    expect(masked.trimStart().startsWith("珠穆朗玛峰")).toBe(true);
  });
});

describe("sentence offsets", () => {
  it("points at the original string: start is the first visible character", () => {
    const source = "**珠穆朗玛峰**的高度为 8848.86 米。后面还有一句完整的话。";
    const [first, second] = splitSentences(source);
    // The masked leading ** is whitespace, so the span opens on the first character the
    // reader actually sees; everything between start and end is still the original string.
    expect(source.slice(first?.start, first?.end)).toBe("珠穆朗玛峰**的高度为 8848.86 米。");
    expect(source[(first?.end ?? 0) - 1]).toBe("。");
    expect(second?.text).toBe("后面还有一句完整的话。");
    expect(source.slice(second?.start, second?.end)).toBe("后面还有一句完整的话。");
  });

  it("ends just past the last visible character, which is where a mark belongs", () => {
    const source = "珠峰的高度是这个数。   \n\n下一段又说了别的事情。";
    const [first] = splitSentences(source);
    expect(source[(first?.end ?? 0) - 1]).toBe("。");
  });
});

describe("splitSentences", () => {
  it("cuts on the sentence punctuation of several scripts", () => {
    expect(splitSentences("珠峰有多高？答案是八千多米。").map((s) => s.text)).toEqual([
      "珠峰有多高？",
      "答案是八千多米。",
    ]);
  });

  it("treats a decimal point as a decimal point, not a full stop", () => {
    expect(splitSentences("它的高度是 8848.86 米。").map((s) => s.text)).toEqual([
      "它的高度是 8848.86 米。",
    ]);
  });

  it("drops fragments too short to carry a claim", () => {
    expect(splitSentences("好的。珠穆朗玛峰的高度是 8848.86 米。").map((s) => s.text)).toEqual([
      "珠穆朗玛峰的高度是 8848.86 米。",
    ]);
  });

  it("makes a line without terminal punctuation one sentence", () => {
    expect(splitSentences("这是一行没有句号的说明").map((s) => s.text)).toEqual([
      "这是一行没有句号的说明",
    ]);
  });
});
