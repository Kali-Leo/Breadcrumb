/**
 * Purpose: the parts of table structure recognition that are not the model — a table's
 * crop into the tensor SLANet_plus takes, and its two outputs (a structure token per step,
 * a cell box per step) into the cells of a grid.
 *
 * SLANet writes a table as HTML tokens: `<tr>`, a cell as `<td></td>` or, when it spans, as
 * `<td` followed by ` colspan="n"` / ` rowspan="n"` tokens and `>`. The token list is
 * PaddleOCR's dictionary with `<td>` taken out and `<td></td>` put at the end, `sos` before
 * it all and `eos` after — the model's own vocabulary order, which the dictionary file
 * alone does not show. Cells are laid onto a grid the way a browser lays out an HTML table:
 * a spanning cell reserves its slots in the rows below, and the next cell of a row takes the
 * next free slot.
 * Main exports: TABLE_SIZE, tableDictionary, tableTensor, decodeStructure, gridOf,
 * TableCell, TableGrid, StructureToken.
 */
import type { OcrBox } from "@desktop/lib/library/ocrPage";
import { resizeRgbaToBgrPlanes, type TableCrop } from "./ocrImage";

export const TABLE_SIZE = 488;
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

/** The vocabulary in index order. `dictLines` is the published list, one token a line. */
export function tableDictionary(dictLines: readonly string[]): string[] {
  const tokens = dictLines.filter((token) => token !== "" && token !== "<td>");
  return ["sos", ...tokens, "<td></td>", "eos"];
}

export interface TableInput {
  /** `[1, 3, TABLE_SIZE, TABLE_SIZE]`. */
  data: Float32Array;
  /** The crop's longest side in pixels: what a normalised cell coordinate is multiplied by. */
  longestSide: number;
}

/** `ResizeByLong` to the model's square, ImageNet normalisation, zero padding to the
 * bottom and right — PaddleOCR's `TablePredictor` order, padding after normalisation. */
export function tableTensor(crop: TableCrop): TableInput {
  const longestSide = Math.max(crop.width, crop.height);
  const scale = TABLE_SIZE / longestSide;
  const resizedWidth = Math.max(1, Math.round(crop.width * scale));
  const resizedHeight = Math.max(1, Math.round(crop.height * scale));
  const planes = resizeRgbaToBgrPlanes(
    crop.rgba,
    crop.width,
    crop.height,
    resizedWidth,
    resizedHeight,
  );
  const plane = TABLE_SIZE * TABLE_SIZE;
  const data = new Float32Array(3 * plane);
  for (let channel = 0; channel < 3; channel += 1) {
    const source = (2 - channel) * resizedWidth * resizedHeight;
    for (let y = 0; y < resizedHeight; y += 1) {
      for (let x = 0; x < resizedWidth; x += 1) {
        const value = (planes[source + y * resizedWidth + x] as number) / 255;
        data[channel * plane + y * TABLE_SIZE + x] =
          (value - (MEAN[channel] as number)) / (STD[channel] as number);
      }
    }
  }
  return { data, longestSide };
}

export interface StructureToken {
  token: string;
  /** The cell's box in crop pixels, for the two tokens that open a cell. */
  box?: OcrBox;
}

/**
 * Greedy decoding of `[1, steps, classes]` logits: the most likely token at each step until
 * `eos`. A box belongs to the step of the token that opens a cell, as four corners
 * normalised to the padded square; the axis-aligned box in crop pixels is what is kept.
 */
export function decodeStructure(
  logits: Float32Array,
  logitDims: readonly number[],
  boxes: Float32Array,
  boxDims: readonly number[],
  dictionary: readonly string[],
  longestSide: number,
): StructureToken[] {
  const [, steps = 0, classes = 0] = logitDims;
  const boxStride = boxDims[2] ?? 8;
  const eos = dictionary.length - 1;
  const tokens: StructureToken[] = [];
  for (let step = 0; step < steps; step += 1) {
    let best = 0;
    let bestValue = -Infinity;
    for (let cls = 0; cls < classes; cls += 1) {
      const value = logits[step * classes + cls] as number;
      if (value > bestValue) {
        bestValue = value;
        best = cls;
      }
    }
    if (best === eos && step > 0) break;
    if (best === 0) continue;
    const token = dictionary[best] ?? "";
    if (token !== "<td></td>" && token !== "<td") {
      tokens.push({ token });
      continue;
    }
    const xs: number[] = [];
    const ys: number[] = [];
    for (let corner = 0; corner < 4; corner += 1) {
      xs.push((boxes[step * boxStride + corner * 2] as number) * longestSide);
      ys.push((boxes[step * boxStride + corner * 2 + 1] as number) * longestSide);
    }
    tokens.push({
      token,
      box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) },
    });
  }
  return tokens;
}

export interface TableCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  box: OcrBox;
}

export interface TableGrid {
  rows: number;
  cols: number;
  cells: TableCell[];
}

/** HTML table layout over the token stream: cells take the next free slot of their row and
 * spanning cells reserve slots below. Tokens that are not rows or cells are structure the
 * grid does not need (`<thead>`, `</td>`). */
export function gridOf(tokens: readonly StructureToken[]): TableGrid {
  const taken = new Set<string>();
  const cells: TableCell[] = [];
  let row = -1;
  let col = 0;
  let open: TableCell | null = null;
  let cols = 0;
  const place = (cell: TableCell) => {
    for (let r = 0; r < cell.rowSpan; r += 1) {
      for (let c = 0; c < cell.colSpan; c += 1) taken.add(`${cell.row + r},${cell.col + c}`);
    }
    cols = Math.max(cols, cell.col + cell.colSpan);
    cells.push(cell);
  };
  for (const { token, box } of tokens) {
    if (token === "<tr>") {
      row += 1;
      col = 0;
      continue;
    }
    if (token === "<td></td>" || token === "<td") {
      if (row < 0) row = 0;
      while (taken.has(`${row},${col}`)) col += 1;
      const cell: TableCell = {
        row,
        col,
        rowSpan: 1,
        colSpan: 1,
        box: box ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
      };
      if (token === "<td></td>") {
        place(cell);
        col += 1;
      } else open = cell;
      continue;
    }
    if (open === null) continue;
    const span = /^ (colspan|rowspan)="(\d+)"$/.exec(token);
    if (span !== null) {
      if (span[1] === "colspan") open.colSpan = Number(span[2]);
      else open.rowSpan = Number(span[2]);
    } else if (token === ">") {
      place(open);
      col = open.col + open.colSpan;
      open = null;
    }
  }
  const rows = Math.max(row + 1, ...cells.map((cell) => cell.row + cell.rowSpan));
  return { rows, cols, cells };
}
