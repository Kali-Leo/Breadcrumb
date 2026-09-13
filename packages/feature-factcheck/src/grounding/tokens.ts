/**
 * Purpose: the token sets the literal-overlap half of alignment is computed on. Lowercased
 * alphanumeric runs are words; CJK runs go through the product's dictionary segmenter, so
 * 「计算机科学」 contributes two words rather than four overlapping character pairs.
 *
 * Why a set and a Jaccard rather than a similarity model: this is the gate that has to keep
 * working when the local embedder does not (not downloaded yet, offline first run, a script
 * the model is weak on). It sees a near-verbatim restatement that any tokenizer would agree
 * on, and it sees nothing else — which is the right division of labour with the vector gate
 * beside it.
 * Main exports: tokenizeText, isWholeWord, contentTokens, overlapCoefficient.
 */
import { segmentChinese } from "@breadcrumb/core-text";

const CJK_RANGES: readonly [number, number][] = [
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0x3400, 0x4dbf], // CJK Extension A
];

function isCjk(char: string): boolean {
  const codePoint = char.codePointAt(0) ?? 0;
  return CJK_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to);
}

export function tokenizeText(text: string): Set<string> {
  const lowered = text.toLowerCase();
  const tokens = new Set<string>();
  let alnumRun = "";
  let cjkRun = "";

  const flushAlnum = (): void => {
    if (alnumRun.length > 0) tokens.add(alnumRun);
    alnumRun = "";
  };
  const flushCjk = (): void => {
    for (const token of segmentChinese(cjkRun)) tokens.add(token);
    cjkRun = "";
  };

  for (const char of lowered) {
    if (isCjk(char)) {
      flushAlnum();
      cjkRun += char;
    } else if (/[a-z0-9]/.test(char)) {
      flushCjk();
      alnumRun += char;
    } else {
      flushAlnum();
      flushCjk();
    }
  }
  flushAlnum();
  flushCjk();

  return tokens;
}

/**
 * True unless the token is a CJK run the segmenter would itself break up — i.e. a bigram
 * fragment it produced only because its dictionary had nothing better. 「高度」 is a word;
 * 「的高」 is the seam between two of them, and it recurs everywhere.
 */
export function isWholeWord(token: string): boolean {
  if (!/[\u3400-\u4dbf\u4e00-\u9fff]/.test(token)) return true;
  return segmentChinese(token).length === 1;
}

/**
 * The tokens that carry content: anything of two characters or more. What is left after this
 * is what decides whether a line is a claim or a heading.
 *
 * Deliberately NOT filtered by isWholeWord. A bigram the segmenter produced because its
 * dictionary had nothing to say — 「雪面」, 「面高」 — is still content the reader is reading; it is
 * only unfit to be pasted onto a query as an entity. Filtering it here counted 「8848.86 米
 * （雪面高程）。」 as two tokens and threw the answer's most checkable sentence away.
 */
export function contentTokens(text: string): string[] {
  return [...tokenizeText(text)].filter((token) => token.length >= 2);
}

/**
 * |A ∩ B| / min(|A|, |B|) — how much of the shorter side the two share.
 *
 * Not the symmetric Jaccard, and the difference is not cosmetic: an answer sentence is a
 * clause and a source sentence is an encyclopaedia sentence, so a reply that copies a source
 * word for word still scores |A| / |B| under Jaccard — eight tokens inside twenty-five is
 * 0.32, and a literal gate anywhere near a meaningful threshold would reject every real
 * quotation. Measured on a live round, that is exactly what happened: with the local embedder
 * unavailable, a Jaccard gate labelled an entire answer as the model's own, including the
 * sentence that had lifted its figure straight out of the sources.
 *
 * Two empty sets have no overlap to speak of rather than a perfect one: returning 1 there
 * would make every blank line match every source sentence.
 */
export function overlapCoefficient(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
}
