/**
 * Purpose: the parts of layout and table recognition that are ours rather than the models' —
 * the tensors the models take, the boxes and tokens they return, the grid a token stream
 * lays out, and which cell a line of text belongs to. Each is checked against what
 * PaddleOCR's own post-processing would compute, because a quiet disagreement here reads
 * as a table with its columns shifted, not as a bug.
 */
import { describe, expect, it } from "vitest";
import { cropRegion } from "./ocr/ocrImage";
import {
  dedupeBoxes,
  LAYOUT_LABELS,
  LAYOUT_SIZE,
  layoutBoxes,
  layoutTensor,
} from "./ocr/ocrLayout";
import {
  decodeStructure,
  gridOf,
  type StructureToken,
  TABLE_SIZE,
  tableDictionary,
  tableTensor,
} from "./ocr/ocrTable";
import { cellFor, tableRows } from "./ocr/ocrTableText";

const DICT_LINES = [
  "<thead>",
  "</thead>",
  "<tbody>",
  "</tbody>",
  "<tr>",
  "</tr>",
  "<td>",
  "<td",
  ">",
  "</td>",
  ...Array.from({ length: 19 }, (_, i) => ` colspan="${i + 2}"`),
  ...Array.from({ length: 19 }, (_, i) => ` rowspan="${i + 2}"`),
];

const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });
const tok = (token: string, b?: ReturnType<typeof box>): StructureToken =>
  b === undefined ? { token } : { token, box: b };

describe("layout detection around the model", () => {
  it("squashes the page to the model's square in RGB, 0..1, and says how far it was scaled", () => {
    const rgba = new Uint8Array(4 * 2 * 4);
    for (let i = 0; i < 8; i += 1) rgba.set([255, 0, 51, 255], i * 4);
    const input = layoutTensor(rgba, 4, 2);
    const plane = LAYOUT_SIZE * LAYOUT_SIZE;
    expect(input.image).toHaveLength(3 * plane);
    expect(input.image[0]).toBe(1);
    expect(input.image[plane]).toBe(0);
    expect(input.image[2 * plane]).toBeCloseTo(0.2);
    expect([...input.scaleFactor]).toEqual([LAYOUT_SIZE / 2, LAYOUT_SIZE / 4]);
  });

  it("names the classes of the model's rows, clamps them to the page and drops fillers", () => {
    const table = LAYOUT_LABELS.indexOf("table");
    const output = new Float32Array([
      table,
      0.9,
      -5,
      10,
      200,
      90,
      -1,
      0,
      0,
      0,
      0,
      0,
      2,
      0.4,
      1,
      2,
      3,
      4,
    ]);
    expect(layoutBoxes(output, [3, 6], { width: 100, height: 100 })).toEqual([
      { label: "table", score: expect.closeTo(0.9, 5), box: box(0, 10, 100, 90) },
      { label: "text", score: expect.closeTo(0.4, 5), box: box(1, 2, 3, 4) },
    ]);
  });

  it("keeps the larger of two boxes when one is mostly inside the other", () => {
    const big = { label: "table", score: 0.5, box: box(0, 0, 100, 100) };
    const inner = { label: "table", score: 0.9, box: box(10, 10, 90, 90) };
    const apart = { label: "table", score: 0.9, box: box(200, 0, 300, 100) };
    expect(dedupeBoxes([inner, apart, big])).toEqual(expect.arrayContaining([big, apart]));
    expect(dedupeBoxes([inner, apart, big])).toHaveLength(2);
  });
});

describe("table structure around the model", () => {
  it("builds the vocabulary the way the model was trained: no <td>, <td></td> last, sos and eos", () => {
    const dictionary = tableDictionary(DICT_LINES);
    expect(dictionary).toHaveLength(50);
    expect(dictionary[0]).toBe("sos");
    expect(dictionary[7]).toBe("<td");
    expect(dictionary[48]).toBe("<td></td>");
    expect(dictionary[49]).toBe("eos");
    expect(dictionary).not.toContain("<td>");
  });

  it("cuts a region out of the page with a margin, clamped to the page", () => {
    const rgba = new Uint8Array(10 * 10 * 4);
    for (let i = 0; i < 100; i += 1) rgba.set([i, 0, 0, 255], i * 4);
    const crop = cropRegion(rgba, 10, 10, box(2, 2, 4, 3), 3);
    expect(crop.box).toEqual(box(0, 0, 7, 6));
    expect([crop.width, crop.height]).toEqual([7, 6]);
    expect(crop.rgba[0]).toBe(0);
    expect(crop.rgba[(1 * 7 + 3) * 4]).toBe(13);
  });

  it("resizes by the longest side, normalises, and pads the rest of the square with zeros", () => {
    const crop = { rgba: new Uint8Array(20 * 10 * 4).fill(255), width: 20, height: 10 };
    const input = tableTensor(crop);
    expect(input.longestSide).toBe(20);
    const plane = TABLE_SIZE * TABLE_SIZE;
    expect(input.data).toHaveLength(3 * plane);
    expect(input.data[0]).toBeCloseTo((1 - 0.485) / 0.229, 4);
    // Row 243 is below the resized 488×244 image: padding.
    expect(input.data[243 * TABLE_SIZE + 1] ?? 1).not.toBe(0);
    expect(input.data[300 * TABLE_SIZE]).toBe(0);
  });

  it("decodes the likeliest token a step, stops at eos, and scales cell boxes to crop pixels", () => {
    const dictionary = tableDictionary(DICT_LINES);
    const at = (token: string) => dictionary.indexOf(token);
    const steps = [at("<tr>"), at("<td></td>"), at("</tr>"), at("eos"), at("<tr>")];
    const logits = new Float32Array(steps.length * 50);
    steps.forEach((cls, step) => {
      logits[step * 50 + cls] = 1;
    });
    const boxes = new Float32Array(steps.length * 8);
    boxes.set([0.1, 0.2, 0.5, 0.2, 0.5, 0.4, 0.1, 0.4], 8);
    const tokens = decodeStructure(
      logits,
      [1, steps.length, 50],
      boxes,
      [1, steps.length, 8],
      dictionary,
      200,
    );
    expect(tokens.map((token) => token.token)).toEqual(["<tr>", "<td></td>", "</tr>"]);
    const cell = tokens[1]?.box ?? box(0, 0, 0, 0);
    expect([cell.x0, cell.y0, cell.x1, cell.y1].map((v) => Math.round(v))).toEqual([
      20, 40, 100, 80,
    ]);
  });

  it("lays cells onto a grid, with a spanning cell reserving the slots below and beside it", () => {
    const tokens: StructureToken[] = [
      tok("<thead>"),
      tok("<tr>"),
      tok("<td", box(0, 0, 10, 10)),
      tok(' rowspan="2"'),
      tok(">"),
      tok("</td>"),
      tok("<td", box(10, 0, 30, 5)),
      tok(' colspan="2"'),
      tok(">"),
      tok("</td>"),
      tok("</tr>"),
      tok("<tr>"),
      tok("<td></td>", box(10, 5, 20, 10)),
      tok("<td></td>", box(20, 5, 30, 10)),
      tok("</tr>"),
    ];
    const grid = gridOf(tokens);
    expect([grid.rows, grid.cols]).toEqual([2, 3]);
    expect(grid.cells.map((cell) => [cell.row, cell.col, cell.rowSpan, cell.colSpan])).toEqual([
      [0, 0, 2, 1],
      [0, 1, 1, 2],
      [1, 1, 1, 1],
      [1, 2, 1, 1],
    ]);
  });
});

describe("the words into the cells", () => {
  const cells = [{ box: box(0, 0, 50, 20) }, { box: box(50, 0, 100, 20) }];

  it("gives a line to the cell holding most of it, or the nearest cell when none does", () => {
    expect(cellFor(box(5, 5, 60, 15), cells)).toBe(0);
    expect(cellFor(box(45, 5, 95, 15), cells)).toBe(1);
    expect(cellFor(box(70, 30, 80, 40), cells)).toBe(1);
    expect(cellFor(box(0, 0, 1, 1), [])).toBe(-1);
  });

  it("fills a grid from the page's lines, in reading order, padded to the grid's width", () => {
    const grid = {
      rows: 2,
      cols: 2,
      cells: [
        { row: 0, col: 0, rowSpan: 1, colSpan: 2, box: box(0, 0, 100, 20) },
        { row: 1, col: 0, rowSpan: 1, colSpan: 1, box: box(0, 20, 50, 40) },
        { row: 1, col: 1, rowSpan: 1, colSpan: 1, box: box(50, 20, 100, 40) },
      ],
    };
    const line = (text: string, b: ReturnType<typeof box>) => ({ text, score: 1, box: b });
    const lines = [
      line("b", box(60, 105, 90, 115)),
      line("a", box(10, 105, 40, 115)),
      line("left", box(10, 125, 40, 135)),
      line("outside", box(300, 300, 340, 310)),
    ];
    expect(tableRows(grid, lines, box(0, 100, 100, 140), { x: 0, y: 100 })).toEqual([
      ["a b", ""],
      ["left", ""],
    ]);
  });

  it("is not a table with one row or one column", () => {
    const one = {
      rows: 1,
      cols: 3,
      cells: [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, box: box(0, 0, 1, 1) }],
    };
    expect(tableRows(one, [], box(0, 0, 10, 10), { x: 0, y: 0 })).toBeNull();
  });
});
