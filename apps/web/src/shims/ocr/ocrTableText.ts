/**
 * Purpose: putting the words into the cells. SLANet says where a table's cells are; the
 * text recogniser has already read the page's lines and where they are; each line inside the
 * table goes to the cell that holds most of it — or, for a line that no cell box covers at
 * all, to the cell whose centre is nearest, since the model's boxes can undershoot a cell by
 * a few pixels while the line is unmistakably its content. A cell's text is its lines in
 * reading order; the grid comes back with every row padded to the same width, a spanning
 * cell's text in its first slot and blanks in the others, which is what the Markdown table
 * on the other side can hold. The same rule runs on the desktop, in Rust, so a table reads
 * the same on both editions.
 * Main exports: TABLE_LINE_INSIDE, tableRows.
 */
import type { OcrBox, OcrLine } from "@desktop/lib/library/ocrPage";
import { insideFraction } from "./ocrLayout";
import type { TableGrid } from "./ocrTable";

/** How much of a line has to lie inside the table box for the line to be the table's. */
export const TABLE_LINE_INSIDE = 0.5;

function centre(box: OcrBox): [number, number] {
  return [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
}

function readingOrder(a: OcrBox, b: OcrBox): number {
  const tolerance = Math.max(10, 0.5 * Math.min(a.y1 - a.y0, b.y1 - b.y0));
  if (Math.abs(a.y0 - b.y0) < tolerance) return a.x0 - b.x0;
  return a.y0 - b.y0;
}

/** The index of the cell a line belongs to, or -1 when the grid has no cells. */
export function cellFor(line: OcrBox, cells: readonly { box: OcrBox }[]): number {
  let best = -1;
  let bestInside = 0;
  cells.forEach((cell, index) => {
    const inside = insideFraction(line, cell.box);
    if (inside > bestInside) {
      bestInside = inside;
      best = index;
    }
  });
  if (best >= 0) return best;
  let bestDistance = Infinity;
  const [lx, ly] = centre(line);
  cells.forEach((cell, index) => {
    const [cx, cy] = centre(cell.box);
    const distance = Math.hypot(cx - lx, cy - ly);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

/**
 * The table's rows of cell text. `lines` are the page's lines with boxes in page pixels;
 * `origin` is where the crop the grid was read from starts on the page, so the cells' crop
 * pixels and the lines' page pixels meet. Null when the grid is too small to be a table.
 */
export function tableRows(
  grid: TableGrid,
  lines: readonly OcrLine[],
  tableBox: OcrBox,
  origin: { x: number; y: number },
): string[][] | null {
  if (grid.rows < 2 || grid.cols < 2 || grid.cells.length === 0) return null;
  const cells = grid.cells.map((cell) => ({
    ...cell,
    box: {
      x0: cell.box.x0 + origin.x,
      y0: cell.box.y0 + origin.y,
      x1: cell.box.x1 + origin.x,
      y1: cell.box.y1 + origin.y,
    },
  }));
  const owned = lines
    .filter((line) => insideFraction(line.box, tableBox) >= TABLE_LINE_INSIDE)
    .sort((a, b) => readingOrder(a.box, b.box));
  const texts: string[][] = cells.map(() => []);
  for (const line of owned) {
    const index = cellFor(line.box, cells);
    if (index >= 0) texts[index]?.push(line.text.trim());
  }
  const rows = Array.from({ length: grid.rows }, () => Array<string>(grid.cols).fill(""));
  cells.forEach((cell, index) => {
    const row = rows[cell.row];
    if (row !== undefined && cell.col < grid.cols) {
      row[cell.col] = (texts[index] ?? []).filter((text) => text !== "").join(" ");
    }
  });
  return rows;
}
