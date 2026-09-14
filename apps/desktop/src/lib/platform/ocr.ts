/**
 * Purpose: TS bridge to text recognition — the Rust `ocr_page` command on the desktop, the
 * browser edition's Worker behind the same name (apps/web/src/shims/ocr.ts), and tesseract
 * for the three interface languages whose scripts neither of those reads.
 *
 * Unlike the embedding bridge, nothing here is swallowed. Embeddings are an acceleration
 * and a missing vector is a slightly worse search; a scanned page that cannot be read is a
 * page the reader will never find, and the import that hit it has to say so. So a failure
 * is thrown, wrapped in one type that the library store turns into one sentence.
 * Main exports: recognizePage, RecognitionUnavailableError.
 */
import type { PageImage } from "@breadcrumb/core-ingest";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../../stores/settingsStore";
import { recognizeWithTesseract, tesseractLanguageFor } from "../library/tesseractOcr";
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

interface RecognizedLine {
  text: string;
  score: number;
}

/**
 * The lines of text on a page image, top to bottom. `language` is the interface language,
 * which decides the engine: Hindi, Bengali and Arabic go to tesseract, everything else to
 * the PP-OCRv6 model both editions run. The first call downloads what it needs, network
 * switch permitting; an already-downloaded model works with the switch off.
 */
export async function recognizePage(image: PageImage, language: string): Promise<string[]> {
  const allowDownload = useSettingsStore.getState().networkEnabled;
  try {
    const tesseract = tesseractLanguageFor(language);
    if (tesseract !== null) return await recognizeWithTesseract(image, tesseract, allowDownload);
    // Raw bytes rather than JSON: a 200 dpi page is fifteen million of them. The size and
    // the switch ride in headers, which is how Tauri's binary channel carries arguments.
    const lines = await invoke<RecognizedLine[]>("ocr_page", image.rgba, {
      headers: {
        "x-width": String(image.width),
        "x-height": String(image.height),
        "x-allow-download": allowDownload ? "1" : "0",
      },
    });
    return lines.map((line) => line.text);
  } catch (error) {
    void degradeSilently("ocr", error);
    throw new RecognitionUnavailableError(error);
  }
}
