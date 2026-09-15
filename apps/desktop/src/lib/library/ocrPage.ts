/**
 * Purpose: what a recognized page is on both editions, and how its pieces become the lines
 * that get indexed. The recognizer — the Rust `ocr_page` command on the desktop, the Worker
 * behind the same name in the browser — hands back the text lines it read, each with where it
 * sits on the page, and the blocks it found that are not running text: a table, read into
 * rows of cells, or a formula, read into LaTeX. Composing them is done here, once, in
 * TypeScript, so the two editions cannot drift on what a table looks like in a passage.
 *
 * The rules are few and deliberate. A block owns a line when most of the line sits inside it;
 * an owned line is not repeated, because the block already says it better. A formula box that
 * owns no whole line is a formula inside a sentence — the layout model finds those too — and
 * it is left to the text, where the OCR already read it as characters. A table is written as a
 * Markdown table because that is what the model reads and what keyword search indexes, and a
 * formula is written between `$$`, which is what the model writes back when it explains one.
 * Main exports: OcrBox, OcrLine, OcrBlock, OcrPageResult, composeRecognizedPage, tableToMarkdown.
 */

/** Page pixels, `x0,y0` top-left, `x1,y1` bottom-right. */
export interface OcrBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrLine {
  text: string;
  /** Mean confidence of the characters read, 0 to 1. */
  score: number;
  box: OcrBox;
}

/** A table's `rows` are cells with spans already expanded to blanks; a formula's `latex`
 * carries no delimiters. */
export type OcrBlock =
  | { kind: "table"; box: OcrBox; rows: string[][] }
  | { kind: "formula"; box: OcrBox; latex: string };

export interface OcrPageResult {
  lines: OcrLine[];
  blocks: OcrBlock[];
}

/** How much of a line has to sit inside a block for the block to own it. */
export const OWNED_FRACTION = 0.7;

function area(box: OcrBox): number {
  return Math.max(0, box.x1 - box.x0) * Math.max(0, box.y1 - box.y0);
}

/** The share of `inner`'s area that lies inside `outer`, 0 to 1. */
export function insideFraction(inner: OcrBox, outer: OcrBox): number {
  const own = area(inner);
  if (own === 0) return 0;
  const overlap = area({
    x0: Math.max(inner.x0, outer.x0),
    y0: Math.max(inner.y0, outer.y0),
    x1: Math.min(inner.x1, outer.x1),
    y1: Math.min(inner.y1, outer.y1),
  });
  return overlap / own;
}

/** Top to bottom, left to right within a line — the same rule the recognizers use. */
function readingOrder(a: OcrBox, b: OcrBox): number {
  const tolerance = Math.max(10, 0.5 * Math.min(a.y1 - a.y0, b.y1 - b.y0));
  if (Math.abs(a.y0 - b.y0) < tolerance) return a.x0 - b.x0;
  return a.y0 - b.y0;
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

/** Cells with text, as a share of all cells, below which a "table" is something else: the
 * layout model calls a periodic-table figure a table, and its grid comes back mostly blank. */
export const MIN_FILLED_CELLS = 0.5;

/** A GitHub-flavoured Markdown table; the first row is the header. Null when the grid is not a
 * table after all — one row, one column, or mostly empty — in which case the lines stand. */
export function tableToMarkdown(rows: readonly (readonly string[])[]): string | null {
  const width = Math.max(0, ...rows.map((row) => row.length));
  if (rows.length < 2 || width < 2) return null;
  const filled = rows.flat().filter((cell) => cell.trim() !== "").length;
  if (filled < MIN_FILLED_CELLS * rows.length * width) return null;
  const padded = rows.map((row) => [...row, ...Array<string>(width - row.length).fill("")]);
  const line = (cells: readonly string[]) => `| ${cells.map(escapeCell).join(" | ")} |`;
  const [header = [], ...body] = padded;
  return [
    line(header),
    `| ${Array<string>(width).fill("---").join(" | ")} |`,
    ...body.map(line),
  ].join("\n");
}

interface Piece {
  box: OcrBox;
  text: string;
}

function blockText(block: OcrBlock): string | null {
  if (block.kind === "formula") {
    const latex = block.latex.trim();
    return latex === "" ? null : `$$${latex}$$`;
  }
  return tableToMarkdown(block.rows);
}

/**
 * The page as lines of text in reading order, blocks written in place of the lines they own.
 * A block's text is surrounded by blank lines so it stays a paragraph of its own downstream.
 */
export function composeRecognizedPage(page: OcrPageResult): string[] {
  const owned = new Set<OcrLine>();
  const pieces: Piece[] = [];
  for (const block of page.blocks) {
    const lines = page.lines.filter(
      (line) => !owned.has(line) && insideFraction(line.box, block.box) >= OWNED_FRACTION,
    );
    // A formula that owns no line is one inside a sentence; the text keeps it.
    if (lines.length === 0 && block.kind === "formula") continue;
    const text = blockText(block);
    if (text === null) continue;
    for (const line of lines) owned.add(line);
    pieces.push({ box: block.box, text: `\n${text}\n` });
  }
  for (const line of page.lines) {
    if (!owned.has(line) && line.text.trim() !== "")
      pieces.push({ box: line.box, text: line.text });
  }
  pieces.sort((a, b) => readingOrder(a.box, b.box));
  return pieces.flatMap((piece) => piece.text.split("\n"));
}
