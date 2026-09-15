/**
 * Purpose: TS bridge to text recognition — the Rust `ocr_page` command on the desktop, the
 * browser edition's Worker behind the same name (apps/web/src/shims/ocr.ts), and tesseract
 * for the three scripts neither of those reads. Which engine a page gets is not chosen by the
 * reader: the main recognizer goes first and its confidence says whether it knew the script;
 * when it did not, tesseract is tried in its three languages and the first confident one is
 * kept for the rest of the document (lib/library/ocrRouting.ts has the numbers).
 *
 * Unlike the embedding bridge, nothing here is swallowed. Embeddings are an acceleration
 * and a missing vector is a slightly worse search; a scanned page that cannot be read is a
 * page the reader will never find, and the import that hit it has to say so. So a failure
 * is thrown, wrapped in one type that the library store turns into one sentence.
 * Main exports: createPageRecognizer, recognizePage, RecognitionUnavailableError.
 */
import type { PageImage } from "@breadcrumb/core-ingest";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../../stores/settingsStore";
import { formulaRecognitionEnabled } from "../library/formulaSetting";
import { composeRecognizedPage, type OcrPageResult } from "../library/ocrPage";
import {
  candidateLanguages,
  hasInk,
  primaryReadsPage,
  TESSERACT_ACCEPT,
} from "../library/ocrRouting";
import type { TesseractLanguage } from "../library/tesseractData";
import { recognizeWithTesseract } from "../library/tesseractOcr";
import { degradeSilently } from "./failureLog";

/** The recognizer could not be had: not downloaded and no network, no reachable host, an
 * engine that failed to load. Distinct from a page that reads as nothing, which is not an
 * error at all. */
export class RecognitionUnavailableError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "RecognitionUnavailableError";
  }
}

/** One page through the main recognizer. Raw bytes rather than JSON: a 200 dpi page is
 * fifteen million of them. The size and the switches ride in headers, which is how Tauri's
 * binary channel carries arguments. The bytes go as a copy: the browser edition's Worker
 * takes the buffer by transfer, and tesseract may still need the page after this returns. */
async function primaryRead(image: PageImage, allowDownload: boolean): Promise<OcrPageResult> {
  return invoke<OcrPageResult>("ocr_page", image.rgba.slice(), {
    headers: {
      "x-width": String(image.width),
      "x-height": String(image.height),
      "x-allow-download": allowDownload ? "1" : "0",
      "x-formulas": formulaRecognitionEnabled() ? "1" : "0",
    },
  });
}

export type PageRecognizer = (image: PageImage) => Promise<string[]>;

/**
 * A recognizer for one document. `language` is the interface language, which only orders the
 * tesseract candidates; the page decides. The first call downloads what it needs, network
 * switch permitting; an already-downloaded model works with the switch off.
 */
export function createPageRecognizer(language: string): PageRecognizer {
  let chosen: TesseractLanguage | null = null;

  async function tesseract(image: PageImage, candidate: TesseractLanguage, allowDownload: boolean) {
    const reading = await recognizeWithTesseract(image, candidate, allowDownload);
    return reading.confidence >= TESSERACT_ACCEPT ? reading.lines : null;
  }

  return async (image) => {
    const allowDownload = useSettingsStore.getState().networkEnabled;
    try {
      if (chosen !== null) {
        const lines = await tesseract(image, chosen, allowDownload);
        if (lines !== null) return lines;
        chosen = null;
      }
      const primary = await primaryRead(image, allowDownload);
      if (primaryReadsPage(primary.lines)) return composeRecognizedPage(primary);
      if (primary.lines.length === 0 && !hasInk(image)) return [];
      // Not the main recognizer's script, or not confidently so. A candidate that cannot be
      // had — data not downloaded, switch off — is noted and the next one tried; the note is
      // what the reader sees only if no engine could read the page at all.
      let unavailable: unknown = null;
      for (const candidate of candidateLanguages(language)) {
        try {
          const lines = await tesseract(image, candidate, allowDownload);
          if (lines !== null) {
            chosen = candidate;
            return lines;
          }
        } catch (error) {
          // Logged like every degradation: a candidate that could not run is a fact worth
          // seeing in the lab panel even when another engine read the page.
          void degradeSilently("ocr", error);
          unavailable ??= error;
        }
      }
      if (unavailable !== null && primary.lines.length === 0) throw unavailable;
      return composeRecognizedPage(primary);
    } catch (error) {
      void degradeSilently("ocr", error);
      throw new RecognitionUnavailableError(error);
    }
  };
}

/** One page on its own, with no document to remember a choice for. */
export function recognizePage(image: PageImage, language: string): Promise<string[]> {
  return createPageRecognizer(language)(image);
}
