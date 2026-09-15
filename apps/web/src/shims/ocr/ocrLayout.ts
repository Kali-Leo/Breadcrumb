/**
 * Purpose: the parts of layout detection that are not the model — the page into the
 * tensor PP-DocLayout-S takes, and its detections into the boxes worth acting on.
 *
 * The model is a PicoDet with its non-maximum suppression inside the graph, so what comes
 * out is already a short list of `(class, score, x0, y0, x1, y1)` rows in page pixels; this
 * module only has to name the classes, keep the ones the worker acts on, and drop the
 * duplicates PicoDet's per-class suppression leaves behind (a box wholly inside a bigger
 * box of the same kind). Only tables are kept in the browser: it has no formula model, and
 * the text recogniser already reads what is inside every other kind of region. The score
 * floor is 0.3 rather than PaddleOCR's 0.5 because this is the small model — at 0.5 it found
 * two of six OpenStax tables, at 0.3 five.
 * Main exports: LAYOUT_SIZE, LAYOUT_LABELS, TABLE_SCORE, layoutTensor, layoutBoxes,
 * dedupeBoxes, LayoutBox.
 */
import type { OcrBox } from "@desktop/lib/library/ocrPage";
import { resizeRgbaToBgrPlanes } from "./ocrImage";

export const LAYOUT_SIZE = 480;
export const TABLE_SCORE = 0.3;
/** Class index order of PaddleOCR's 23-class PP-DocLayout models. */
export const LAYOUT_LABELS = [
  "paragraph_title",
  "image",
  "text",
  "number",
  "abstract",
  "content",
  "figure_title",
  "formula",
  "table",
  "table_title",
  "reference",
  "doc_title",
  "footnote",
  "header",
  "algorithm",
  "footer",
  "seal",
  "chart_title",
  "chart",
  "formula_number",
  "header_image",
  "footer_image",
  "aside_text",
] as const;

export interface LayoutBox {
  label: string;
  score: number;
  box: OcrBox;
}

export interface LayoutInput {
  /** `[1, 3, LAYOUT_SIZE, LAYOUT_SIZE]`, RGB, 0..1 — this family takes no mean or std. */
  image: Float32Array;
  /** `[1, 2]`: how much the model's grid has to be divided by to land on the page. */
  scaleFactor: Float32Array;
}

/** The page squashed to the model's square, whatever its aspect ratio — `Resize` with
 * `keep_ratio: false`, which is how the model was trained. */
export function layoutTensor(rgba: Uint8Array, width: number, height: number): LayoutInput {
  const planes = resizeRgbaToBgrPlanes(rgba, width, height, LAYOUT_SIZE, LAYOUT_SIZE);
  const plane = LAYOUT_SIZE * LAYOUT_SIZE;
  const image = new Float32Array(3 * plane);
  for (let channel = 0; channel < 3; channel += 1) {
    // The planes come BGR; the model wants RGB.
    const source = (2 - channel) * plane;
    const target = channel * plane;
    for (let index = 0; index < plane; index += 1) {
      image[target + index] = (planes[source + index] as number) / 255;
    }
  }
  return {
    image,
    scaleFactor: new Float32Array([LAYOUT_SIZE / height, LAYOUT_SIZE / width]),
  };
}

/** The rows of the model's `[N, 6]` output as boxes, clamped to the page, with the labels
 * named. A negative class is PicoDet's "no detection" filler and is dropped. */
export function layoutBoxes(
  output: Float32Array,
  dims: readonly number[],
  page: { width: number; height: number },
): LayoutBox[] {
  const [count = 0, stride = 6] = dims;
  const boxes: LayoutBox[] = [];
  const clampX = (value: number) => Math.min(page.width, Math.max(0, value));
  const clampY = (value: number) => Math.min(page.height, Math.max(0, value));
  for (let row = 0; row < count; row += 1) {
    const offset = row * stride;
    const cls = Math.round(output[offset] as number);
    const label = LAYOUT_LABELS[cls];
    if (cls < 0 || label === undefined) continue;
    boxes.push({
      label,
      score: output[offset + 1] as number,
      box: {
        x0: clampX(output[offset + 2] as number),
        y0: clampY(output[offset + 3] as number),
        x1: clampX(output[offset + 4] as number),
        y1: clampY(output[offset + 5] as number),
      },
    });
  }
  return boxes;
}

function area(box: OcrBox): number {
  return Math.max(0, box.x1 - box.x0) * Math.max(0, box.y1 - box.y0);
}

/** The share of `inner` that lies inside `outer`. */
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

/** Largest first; a box that is mostly inside one already kept is the same region twice. */
export function dedupeBoxes(boxes: readonly LayoutBox[], inside = 0.8): LayoutBox[] {
  const kept: LayoutBox[] = [];
  for (const candidate of [...boxes].sort((a, b) => area(b.box) - area(a.box))) {
    if (kept.some((other) => insideFraction(candidate.box, other.box) >= inside)) continue;
    kept.push(candidate);
  }
  return kept;
}
