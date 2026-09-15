/**
 * Purpose: whether scanned pages have their formulas read into LaTeX — a choice the reader
 * makes, because it is the one recognition step that is not free: the formula model is a
 * 232 MB download, against 31 MB for everything else, and it runs only on the desktop
 * edition. Off, a formula is read as the characters the text recognizer makes of it, which
 * is what every scan got before this existed. Kept in the browser's storage rather than in
 * the settings store: it is a property of the library, read by the import and by nothing else.
 * Main exports: formulaRecognitionEnabled, setFormulaRecognitionEnabled, FORMULA_MODEL_MB.
 */
import { isBrowserEdition } from "../platform/edition";

const KEY = "breadcrumb.library.formulas";
/** What the reader is told the first use will download, rounded the way a download dialog
 * would round it. */
export const FORMULA_MODEL_MB = 230;

/** The choice can only be made on the desktop; the browser edition has no formula model. */
export function formulaRecognitionAvailable(): boolean {
  return !isBrowserEdition();
}

export function formulaRecognitionEnabled(): boolean {
  if (!formulaRecognitionAvailable()) return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setFormulaRecognitionEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, enabled ? "1" : "0");
  } catch {
    // Storage refused: the box shows unticked next time, and the reader ticks it again.
  }
}
