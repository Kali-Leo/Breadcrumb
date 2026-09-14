/**
 * Purpose: which text-recognition model the browser edition downloads, from where, and what
 * each file has to be before it is trusted.
 *
 * PP-OCRv6 tiny — PaddleOCR's own ONNX export, unchanged, published in the same repository
 * the embedding model comes from and pinned to its own git tag. Tiny rather than the small
 * pair the desktop runs because a browser pays for every byte twice, once to download and
 * once to hold in WebAssembly memory, and the measured difference is 0.1 of a percentage
 * point of character error (docs/research/2026-09-14-OCR方案调研与实测.md): tiny reads a
 * scanned Chinese textbook at 1.05% against small's 0.92%, for 6.3 MB against 31.
 *
 * Every file's byte count and SHA-256 are here, not in a manifest: a manifest is fetched from
 * the same host as the files and cannot vouch for them. The mirror's manifest mechanism is
 * for graphs too large for one request, and none of these is.
 * Main exports: OCR_MODEL_DIR, OCR_MODEL_TAG, OCR_MODEL_FILES, OCR_MODEL_SOURCES,
 * OcrModelFile, ocrModelSources.
 */
import { MODEL_PACKS_REPO, modelMirrorDirectory } from "@breadcrumb/core-vectors";

export const OCR_MODEL_DIR = "pp-ocrv6-tiny";
/** Moves when the published files change, never when the code around them does. The desktop
 * pins its own pair under `pp-ocrv6-small-v1` (src-tauri/src/ocr.rs). */
export const OCR_MODEL_TAG = "pp-ocrv6-tiny-v1";

export interface OcrModelFile {
  name: string;
  /** Exactly how many bytes. Checked before the digest: a truncated body or a 404 page served
   * with a 200 fails here, saying what it was, rather than as an opaque hash mismatch. */
  bytes: number;
  /** Lowercase hex SHA-256 of the whole file. */
  sha256: string;
}

/** Measured from PaddleOCR's `PP-OCRv6_tiny_{det,rec}_onnx_infer.tar` (paddle3.0.0). */
export const OCR_MODEL_FILES = {
  det: {
    name: "PP-OCRv6_tiny_det.onnx",
    bytes: 1_780_590,
    sha256: "193bab7a04fca699a6c82e6abb5b81bdb28177f0abd4062552b04908dafb19f8",
  },
  rec: {
    name: "PP-OCRv6_tiny_rec.onnx",
    bytes: 4_462_639,
    sha256: "9ef676d6ed3c88256a2d92c640c44f25b0c40947e111b14b8be8f594091563e6",
  },
  /** One character per line, from the `inference.yml` beside the recognition graph. */
  dict: {
    name: "PP-OCRv6_tiny_rec_dict.txt",
    bytes: 27_156,
    sha256: "c5cbe34ef40c29c4df07ed012bf96569cb69a2d2a01a07027e9f13cb832bd9cd",
  },
} as const satisfies Record<string, OcrModelFile>;

/** jsDelivr first, raw GitHub second — the same order and the same reasons as the embedding
 * model's (embedding/modelSource.ts), built from the same constants. */
export const OCR_JSDELIVR_BASE = modelMirrorDirectory(OCR_MODEL_DIR, OCR_MODEL_TAG);
export const OCR_RAW_GITHUB_BASE = `https://raw.githubusercontent.com/${MODEL_PACKS_REPO}/${OCR_MODEL_TAG}/models/${OCR_MODEL_DIR}/`;
export const OCR_MODEL_SOURCES: readonly string[] = [OCR_JSDELIVR_BASE, OCR_RAW_GITHUB_BASE];

/** The candidates this build will try, in order. VITE_MODEL_BASE_URL points every model at
 * one local directory during development; `dir/` under it is where this one is expected. */
export function ocrModelSources(): readonly string[] {
  const configured = import.meta.env.VITE_MODEL_BASE_URL;
  if (typeof configured === "string" && configured !== "") {
    return [`${configured}${OCR_MODEL_DIR}/`];
  }
  return OCR_MODEL_SOURCES;
}
