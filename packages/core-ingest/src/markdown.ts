/**
 * Purpose: Markdown and plain text into heading-aware blocks.
 *
 * Only the heading syntax is read. Everything else — emphasis, links, tables — is left in the
 * text exactly as written, because the reader will see this text quoted back to them and a
 * stripped-down paraphrase of their own book is worse than the punctuation. Fenced code is the
 * one exception the parser has to know about, so that a `#` comment inside a shell block does
 * not become a chapter title.
 *
 * Plain text goes through the same path: it simply has no headings, so the whole file is one
 * block under the document's title. That keeps one chunker and one set of rules for three
 * formats instead of three of each.
 * Main exports: parseMarkdown, titleFromMarkdown.
 */
import type { DocumentBlock } from "./chunking";

const ATX_HEADING = /^(#{1,6})\s+(.*\S)\s*#*\s*$/;
const FENCE = /^\s*(?:```|~~~)/;

/** Headings deeper than this are body text as far as the path is concerned: "书名 → 章 → 节"
 * is three levels, and a path of eight is not a path, it is the document. */
export const MAX_HEADING_DEPTH = 3;

/**
 * `title` becomes the outermost element of every heading path, which is what makes a passage
 * from one book distinguishable from the same sentence in another.
 */
export function parseMarkdown(source: string, title: string): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  const stack: string[] = [];
  let buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    const text = buffer.join("\n").trim();
    buffer = [];
    if (text === "") return;
    blocks.push({ headings: [title, ...stack], text });
  };

  for (const line of source.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      buffer.push(line);
      continue;
    }
    const heading = inFence ? null : ATX_HEADING.exec(line);
    if (heading === null) {
      buffer.push(line);
      continue;
    }
    flush();
    const depth = (heading[1] ?? "").length;
    const text = heading[2] ?? "";
    // The `# Title` line at the top of a document is that document's name, and the name is
    // already the outermost element of every path. Letting it in as well reads "复利入门 →
    // 复利入门 → 第三章", which is not a path, it is a stutter.
    if (depth === 1 && text === title) continue;
    if (depth > MAX_HEADING_DEPTH) {
      // Too deep to be part of the path, but still a line the reader wrote: it stays in the
      // body rather than vanishing.
      buffer.push(line);
      continue;
    }
    stack.length = Math.min(stack.length, depth - 1);
    stack[depth - 1] = text;
  }
  flush();
  return blocks;
}

/** The document's own title if it declares one, otherwise the caller's fallback (a filename).
 * Only a level-1 heading counts, and only before any body text: a `#` further down is a
 * section of the document, not its name. */
export function titleFromMarkdown(source: string, fallback: string): string {
  for (const line of source.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const heading = ATX_HEADING.exec(line);
    if (heading === null) return fallback;
    return (heading[1] ?? "").length === 1 ? (heading[2] ?? fallback) : fallback;
  }
  return fallback;
}
