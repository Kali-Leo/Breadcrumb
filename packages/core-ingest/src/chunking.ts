/**
 * Purpose: cutting a document into the blocks retrieval works on — recursively, at the
 * boundaries a human would choose, and at two sizes.
 *
 * Recursive means: split on paragraph breaks; anything still too long, split on sentence
 * endings; anything still too long, split on whitespace; and only then cut mid-word. Each
 * fallback is worse than the last, so each is only reached when the one above it could not
 * make the piece small enough. A chunker that goes straight to "every 512 tokens" cuts
 * sentences in half, and half a sentence retrieves badly and reads worse.
 *
 * Two sizes, because retrieval and reading want opposite things. Precision wants small units:
 * a paragraph that is about one thing matches a question about that thing. Answering wants
 * large ones: a paragraph rarely contains the sentence before the one that matters. So the
 * child is what the index and the vectors see, and its parent — the ~512-token block it came
 * from — is what the model reads.
 *
 * Every chunk carries its heading path ("书名 → 章 → 节") prepended to the text that is
 * indexed and embedded. Without it a passage saying "it roughly doubles every 18 months" is
 * unreachable by any question that names the subject, because the passage never does.
 * Main exports: chunkBlocks, PARENT_TOKENS, CHILD_TOKENS, DocumentBlock, Chunked, ChunkPair.
 */
import { estimateTokens } from "./tokenEstimate";

/** One run of body text under a heading path, as a parser produced it. */
export interface DocumentBlock {
  /** Outermost first: ["书名", "第三章 复利", "3.2 七二法则"]. A level the document skipped is
   * undefined rather than "", so that "never named" stays distinct from "named nothing". */
  headings: readonly (string | undefined)[];
  text: string;
}

export interface ChunkPair {
  headingPath: string;
  text: string;
  tokens: number;
}

export interface Chunked {
  parent: ChunkPair;
  children: ChunkPair[];
}

/** What the model reads. Big enough to hold the sentence before the one that matched. */
export const PARENT_TOKENS = 512;
/** What the index and the vectors see. Roughly a long paragraph. */
export const CHILD_TOKENS = 160;

export const HEADING_SEPARATOR = " → ";

/** Ordered worst-last: each is tried only when the one before it left a piece too long. */
const SPLITTERS: readonly RegExp[] = [
  /\n\s*\n+/, // paragraphs
  /(?<=[。！？…]|[.!?](?=\s))\s*/u, // sentence endings, Chinese and Latin
  /(?<=[；;，,])\s*/u, // clause boundaries
  /\s+/, // words
];

function hardSplit(text: string, limit: number): string[] {
  const characters = [...text];
  const perPiece = Math.max(1, Math.floor((characters.length * limit) / estimateTokens(text)));
  const pieces: string[] = [];
  for (let start = 0; start < characters.length; start += perPiece) {
    pieces.push(characters.slice(start, start + perPiece).join(""));
  }
  return pieces;
}

/** Splits until every piece fits, then greedily glues neighbours back together so the result
 * is as few pieces as possible rather than as many as the splitter happened to produce. */
export function splitToSize(text: string, limit: number, depth = 0): string[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  if (estimateTokens(trimmed) <= limit) return [trimmed];
  const splitter = SPLITTERS[depth];
  const pieces =
    splitter === undefined
      ? hardSplit(trimmed, limit)
      : trimmed.split(splitter).flatMap((piece) => splitToSize(piece, limit, depth + 1));
  const merged: string[] = [];
  for (const piece of pieces) {
    const last = merged.at(-1);
    if (last !== undefined && estimateTokens(`${last} ${piece}`) <= limit) {
      merged[merged.length - 1] = `${last} ${piece}`;
      continue;
    }
    merged.push(piece);
  }
  return merged;
}

/** Levels the document skipped arrive here as holes (a `##` with no `#` above it), which
 * spread into undefined. They are levels that were never named, not empty ones, so they are
 * dropped rather than rendered as an arrow with nothing between. */
export function headingPathOf(headings: readonly (string | undefined)[]): string {
  return headings
    .filter((heading): heading is string => heading !== undefined && heading.trim() !== "")
    .join(HEADING_SEPARATOR);
}

/** The text that actually gets indexed and embedded: the path, then the passage. */
export function withHeadingPath(headingPath: string, text: string): string {
  return headingPath === "" ? text : `${headingPath}\n${text}`;
}

function toPair(headingPath: string, text: string): ChunkPair {
  return { headingPath, text, tokens: estimateTokens(withHeadingPath(headingPath, text)) };
}

/**
 * Blocks in, parent/child pairs out, in document order. Consecutive blocks are NOT merged
 * across a heading change: two sections that happen to be short are still two sections, and a
 * parent that spans a heading boundary would carry the wrong path for half its text.
 */
export function chunkBlocks(blocks: readonly DocumentBlock[]): Chunked[] {
  const chunked: Chunked[] = [];
  for (const block of blocks) {
    const headingPath = headingPathOf(block.headings);
    for (const parentText of splitToSize(block.text, PARENT_TOKENS)) {
      const children = splitToSize(parentText, CHILD_TOKENS).map((childText) =>
        toPair(headingPath, childText),
      );
      chunked.push({ parent: toPair(headingPath, parentText), children });
    }
  }
  return chunked;
}
