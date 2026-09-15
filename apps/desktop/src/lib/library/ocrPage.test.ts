/**
 * Purpose: a recognized page composes the same way on both editions — a table replaces the
 * lines it owns and becomes Markdown, a display formula becomes `$$…$$`, a formula the layout
 * model found inside a sentence is left to the text, and everything comes out in reading order.
 */
import { describe, expect, it } from "vitest";
import { composeRecognizedPage, insideFraction, type OcrLine, tableToMarkdown } from "./ocrPage";

const line = (text: string, y0: number, x0 = 100, width = 800, height = 30): OcrLine => ({
  text,
  score: 0.99,
  box: { x0, y0, x1: x0 + width, y1: y0 + height },
});

describe("tableToMarkdown", () => {
  it("writes a header row, a rule and the body, escaping pipes", () => {
    expect(
      tableToMarkdown([
        ["Element", "IE1"],
        ["K", "418.8"],
        ["Ca", "a|b"],
      ]),
    ).toBe("| Element | IE1 |\n| --- | --- |\n| K | 418.8 |\n| Ca | a\\|b |");
  });
  it("pads short rows to the grid width", () => {
    expect(tableToMarkdown([["a", "b", "c"], ["d"]])).toBe(
      "| a | b | c |\n| --- | --- | --- |\n| d |  |  |",
    );
  });
  it("refuses a grid that is not a table", () => {
    expect(tableToMarkdown([["only one row", "x"]])).toBeNull();
    expect(tableToMarkdown([["one"], ["column"]])).toBeNull();
    // A figure the layout model took for a table: the grid comes back mostly blank.
    expect(
      tableToMarkdown([
        ["H", "", "", "He"],
        ["", "", "", ""],
        ["Li", "", "", ""],
      ]),
    ).toBeNull();
  });
});

describe("insideFraction", () => {
  it("is the share of the inner box's area inside the outer one", () => {
    const outer = { x0: 0, y0: 0, x1: 100, y1: 100 };
    expect(insideFraction({ x0: 50, y0: 0, x1: 150, y1: 100 }, outer)).toBeCloseTo(0.5);
    expect(insideFraction({ x0: 10, y0: 10, x1: 20, y1: 20 }, outer)).toBe(1);
    expect(insideFraction({ x0: 10, y0: 10, x1: 10, y1: 20 }, outer)).toBe(0);
  });
});

describe("composeRecognizedPage", () => {
  it("replaces the lines a table owns with the table, in reading order", () => {
    const lines = [
      line("Before", 100),
      line("K 418.8", 300),
      line("Ca 589.8", 340),
      line("After", 600),
    ];
    const out = composeRecognizedPage({
      lines,
      blocks: [
        {
          kind: "table",
          box: { x0: 80, y0: 280, x1: 950, y1: 400 },
          rows: [
            ["K", "418.8"],
            ["Ca", "589.8"],
          ],
        },
      ],
    });
    expect(out).toEqual([
      "Before",
      "",
      "| K | 418.8 |",
      "| --- | --- |",
      "| Ca | 589.8 |",
      "",
      "After",
    ]);
  });
  it("writes a display formula between $$ and drops the characters read under it", () => {
    const out = composeRecognizedPage({
      lines: [line("bias(θm)=E(θm)-θ", 500, 550, 300)],
      blocks: [
        { kind: "formula", box: { x0: 540, y0: 490, x1: 860, y1: 535 }, latex: "\\hat{\\theta}_m" },
      ],
    });
    expect(out).toEqual(["", "$$\\hat{\\theta}_m$$", ""]);
  });
  it("leaves a formula inside a sentence to the text that already reads it", () => {
    const sentence = line("其中期望作用在所有数据上，θ 是用于定义数据", 250);
    const out = composeRecognizedPage({
      lines: [sentence],
      blocks: [{ kind: "formula", box: { x0: 400, y0: 248, x1: 460, y1: 282 }, latex: "\\theta" }],
    });
    expect(out).toEqual([sentence.text]);
  });
  it("drops an empty formula and a table too small to be one, keeping the lines", () => {
    const out = composeRecognizedPage({
      lines: [line("x = 1", 100)],
      blocks: [
        { kind: "formula", box: { x0: 90, y0: 95, x1: 950, y1: 135 }, latex: "  " },
        { kind: "table", box: { x0: 90, y0: 95, x1: 950, y1: 135 }, rows: [["x = 1"]] },
      ],
    });
    expect(out).toEqual(["x = 1"]);
  });
  it("keeps two halves of a heading left to right even when their tops differ a little", () => {
    const out = composeRecognizedPage({
      lines: [line("引言", 100, 280, 100, 62), line("第一章", 112, 100, 150, 50)],
      blocks: [],
    });
    expect(out).toEqual(["第一章", "引言"]);
  });
});
