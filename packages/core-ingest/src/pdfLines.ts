/**
 * Purpose: turning the lines of a PDF into headings and body text, when the file itself says
 * nothing about which is which.
 *
 * A PDF has no structure. It has glyphs at coordinates, and everything a reader perceives as a
 * chapter title is typography: bigger, shorter, alone on its line. So that is what is measured
 * — the most common line height in the document is the body, and a line noticeably taller than
 * the body and short enough not to be a sentence is a heading. Distinct heading heights are
 * then ranked, so the biggest becomes a chapter and the next a section, which is the same
 * hierarchy a person reads off the page.
 *
 * A PDF that carries an outline — a table of contents its author exported — could say this
 * outright instead of being guessed at, and that is the obvious next improvement. It is not
 * done yet, and it is worth knowing that most PDFs do not carry one.
 *
 * All of this is separated from pdf.js on purpose: it is the part that can be wrong, so it is
 * the part that has tests.
 * Main exports: PdfLine, groupIntoLines, inferHeadingLevels, linesToBlocks.
 */
import type { DocumentBlock } from "./chunking";
import { MAX_HEADING_DEPTH } from "./markdown";

export interface PdfLine {
  text: string;
  /** Glyph height in PDF units. Not font size, but proportional to it and always present. */
  height: number;
}

/** One text item as pdf.js reports it, reduced to what matters here. */
export interface PdfTextItem {
  text: string;
  height: number;
  y: number;
}

/** Items on the same baseline belong to the same line. PDFs place glyphs individually, so
 * "same" has to mean "within a fraction of a line", not "equal". */
export function groupIntoLines(items: readonly PdfTextItem[], tolerance = 2): PdfLine[] {
  const lines: (PdfLine & { y: number })[] = [];
  for (const item of items) {
    if (item.text.trim() === "") continue;
    const last = lines.at(-1);
    if (last !== undefined && Math.abs(last.y - item.y) <= tolerance) {
      last.text += item.text;
      last.height = Math.max(last.height, item.height);
      continue;
    }
    lines.push({ text: item.text, height: item.height, y: item.y });
  }
  // NFKC here and nowhere else in this package. A PDF typeset in a CJK font hands back Kangxi
  // radicals in place of ordinary characters — ⽂ (U+2F2C) where 文 (U+6587) was written — and
  // unlike a Markdown file, whose bytes are what the author actually typed, a PDF's text layer
  // is already a lossy reconstruction. So this is repairing an extraction artefact, not
  // rewriting someone's prose: the two render almost identically and only one of them is a
  // letter, which decides whether the passage can be found AND whether it reads correctly when
  // it is quoted back.
  return lines.map(({ text, height }) => ({
    text: text.normalize("NFKC").replace(/\s+/g, " ").trim(),
    height,
  }));
}

/** A heading is at least this much taller than the body text. Below it, the difference is
 * more likely to be an accent or a superscript than an author's intent. */
export const HEADING_HEIGHT_RATIO = 1.15;
/** A "heading" longer than this is a sentence that happens to be in a large font — a pull
 * quote, or the first line of a paper's abstract. Characters, not tokens: this is about the
 * shape of the line on the page. */
export const MAX_HEADING_CHARACTERS = 80;

/** The most common height, which in any book is the body text. Ties go to the larger, which
 * errs toward calling less of the document a heading. */
function bodyHeight(lines: readonly PdfLine[]): number {
  const counts = new Map<number, number>();
  for (const line of lines) {
    const bucket = Math.round(line.height * 2) / 2;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = 0;
  for (const [height, count] of counts) {
    if (count > bestCount || (count === bestCount && height > best)) {
      best = height;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Heading level per line, 1-based, or 0 for body text. Level 1 is the largest heading height
 * in the document; levels beyond the path depth are flattened onto the deepest one rather
 * than dropped, so a deeply nested subsection still says which section it is in.
 */
export function inferHeadingLevels(lines: readonly PdfLine[]): number[] {
  const body = bodyHeight(lines);
  const isHeading = (line: PdfLine) =>
    body > 0 &&
    line.height >= body * HEADING_HEIGHT_RATIO &&
    line.text.length <= MAX_HEADING_CHARACTERS;
  const heights = [...new Set(lines.filter(isHeading).map((line) => line.height))].sort(
    (a, b) => b - a,
  );
  const levelOf = new Map(heights.map((height, index) => [height, index + 1]));
  return lines.map((line) =>
    isHeading(line) ? Math.min(levelOf.get(line.height) ?? 1, MAX_HEADING_DEPTH - 1) : 0,
  );
}

/** Lines and their levels into blocks, with `title` as the outermost path element. */
export function linesToBlocks(lines: readonly PdfLine[], title: string): DocumentBlock[] {
  const levels = inferHeadingLevels(lines);
  const blocks: DocumentBlock[] = [];
  const stack: string[] = [];
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join("\n").trim();
    buffer = [];
    if (text !== "") blocks.push({ headings: [title, ...stack], text });
  };
  lines.forEach((line, index) => {
    const level = levels[index] ?? 0;
    if (level === 0) {
      buffer.push(line.text);
      return;
    }
    flush();
    stack.length = Math.min(stack.length, level - 1);
    stack[level - 1] = line.text;
  });
  flush();
  return blocks;
}
