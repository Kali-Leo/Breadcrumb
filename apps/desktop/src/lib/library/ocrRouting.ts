/**
 * Purpose: deciding, page by page, which engine a scanned page is read with — without asking
 * the reader what language it is in.
 *
 * The main recognizer (PP-OCRv6, both editions) reads Chinese, Japanese and forty-odd
 * Latin-script languages, and nothing in Devanagari, Bengali or Arabic. It does
 * not fail loudly on those: it finds a few lines and reads them with low confidence. Measured
 * on the research pages (docs/research/2026-09-15-公式与表格识别实测.md): a page it can read
 * scores 0.97–1.00 on average across its lines, a Hindi or Arabic page 0.55–0.64. So a mean
 * below 0.8 means "not my script", and the page is offered to tesseract in the three
 * languages it has data for. tesseract's own confidence separates just as cleanly: the right
 * language scores 81–93, a wrong one 12–46, so the first candidate above 60 is taken. The
 * interface language goes first, because a reader of Hindi mostly imports Hindi.
 *
 * The decision is remembered for the rest of the document: after one page has chosen a
 * tesseract language the next pages skip the main recognizer, until a page comes back
 * unconfident again. Pure functions here; the engines are called from platform/ocr.ts.
 * Main exports: PRIMARY_CONFIDENT_SCORE, TESSERACT_ACCEPT, primaryReadsPage, hasInk,
 * candidateLanguages.
 */
import type { PageImage } from "@breadcrumb/core-ingest";
import { TESSERACT_LANGUAGES, type TesseractLanguage } from "./tesseractData";

/** Mean line confidence, 0 to 1, below which the main recognizer did not read the page. */
export const PRIMARY_CONFIDENT_SCORE = 0.8;
/** tesseract's page confidence, 0 to 100, from which a language is accepted. */
export const TESSERACT_ACCEPT = 60;
/** Share of sampled pixels that must be dark for a page to count as having anything on it. */
const INK_FRACTION = 0.002;
const DARK = 128;

/** True when the main recognizer's lines are worth keeping: some were found, and on average
 * it was sure of them. An empty page is not "unread"; it is empty. */
export function primaryReadsPage(lines: readonly { score: number }[]): boolean {
  if (lines.length === 0) return false;
  const mean = lines.reduce((sum, line) => sum + line.score, 0) / lines.length;
  return mean >= PRIMARY_CONFIDENT_SCORE;
}

/** Whether there is anything drawn on the page at all. A recognizer that found no lines on a
 * page with ink on it may simply not know the script; on a blank page there is nothing to
 * find, and no second engine is asked. Every eighth pixel is looked at, which is plenty. */
export function hasInk(image: PageImage): boolean {
  const { rgba } = image;
  const pixels = Math.floor(rgba.length / 4);
  if (pixels === 0) return false;
  let dark = 0;
  let sampled = 0;
  for (let index = 0; index < pixels; index += 8) {
    const offset = index * 4;
    const luminance =
      (rgba[offset] ?? 255) * 0.299 +
      (rgba[offset + 1] ?? 255) * 0.587 +
      (rgba[offset + 2] ?? 255) * 0.114;
    if (luminance < DARK) dark += 1;
    sampled += 1;
  }
  return dark / sampled >= INK_FRACTION;
}

/** The tesseract languages to try, the interface language's first when it has one. */
export function candidateLanguages(uiLanguage: string): TesseractLanguage[] {
  const base = uiLanguage.split("-")[0]?.toLowerCase() ?? "";
  const own = TESSERACT_LANGUAGES[base];
  const rest = Object.entries(TESSERACT_LANGUAGES)
    .filter(([code]) => code !== base)
    .map(([, language]) => language);
  return own === undefined ? rest : [own, ...rest];
}
