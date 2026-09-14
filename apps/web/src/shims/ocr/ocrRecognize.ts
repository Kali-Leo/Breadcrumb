/**
 * Purpose: the recogniser's side of the pipeline that is not the model — the detected boxes
 * into batches of 48-pixel-high line images, and the model's per-timestep class scores into
 * text.
 *
 * Lines are read six at a time, sorted by how wide they are relative to their height, which
 * is PaddleOCR's own batching: a batch is padded to its widest member, so a heading beside
 * five captions would be five images that are mostly zeros. The decoding is greedy CTC —
 * the most likely class at each step, blanks and repeats collapsed — and the line's score is
 * the mean confidence of the characters that survived, which is what PaddleOCR reports.
 * Main exports: REC_HEIGHT, REC_BATCH, planRecognitionBatches, recognitionTensor, decodeCtc.
 */
import type { Quad } from "./ocrGeometry";
import { type LineCrop, lineCropOf, sampleQuadToBgrPlanes } from "./ocrImage";

export const REC_HEIGHT = 48;
/** The width the model was trained around; a batch is never narrower than this ratio. */
const REC_BASE_WIDTH = 320;
/** `text_recognition.batch_size` in PaddleOCR's pipeline config. */
export const REC_BATCH = 6;
/** The widest line the model accepts, in pixels at REC_HEIGHT. */
const MAX_REC_WIDTH = 3200;

export interface PlannedLine {
  /** Index into the boxes the caller gave, so results go back where they came from. */
  index: number;
  quad: Quad;
  crop: LineCrop;
  /** Width over height of the crop as it will be read (after any quarter turn). */
  ratio: number;
}

/** Batches of at most REC_BATCH lines, narrowest ratios first. */
export function planRecognitionBatches(boxes: readonly Quad[]): PlannedLine[][] {
  const lines = boxes.map((quad, index) => {
    const crop = lineCropOf(quad);
    const ratio = crop.rotated
      ? crop.cropHeight / crop.cropWidth
      : crop.cropWidth / crop.cropHeight;
    return { index, quad, crop, ratio };
  });
  lines.sort((a, b) => a.ratio - b.ratio);
  const batches: PlannedLine[][] = [];
  for (let start = 0; start < lines.length; start += REC_BATCH) {
    batches.push(lines.slice(start, start + REC_BATCH));
  }
  return batches;
}

export interface RecognitionInput {
  data: Float32Array;
  /** `[batch, 3, REC_HEIGHT, width]`. */
  dims: [number, number, number, number];
}

/**
 * One batch as the model's input. Every line is resized to REC_HEIGHT keeping its aspect
 * ratio, normalised to [-1, 1], and laid into a tensor as wide as the batch's widest line,
 * the remainder left at zero — `resize_norm_img` in PaddleOCR, for the whole batch at once.
 */
export function recognitionTensor(
  rgba: Uint8Array,
  width: number,
  height: number,
  batch: readonly PlannedLine[],
): RecognitionInput {
  const maxRatio = Math.max(REC_BASE_WIDTH / REC_HEIGHT, ...batch.map((line) => line.ratio));
  const tensorWidth = Math.min(MAX_REC_WIDTH, Math.max(1, Math.trunc(REC_HEIGHT * maxRatio)));
  const plane = REC_HEIGHT * tensorWidth;
  const data = new Float32Array(batch.length * 3 * plane);
  batch.forEach((line, slot) => {
    const lineWidth = Math.min(tensorWidth, Math.ceil(REC_HEIGHT * line.ratio));
    const planes = sampleQuadToBgrPlanes(
      rgba,
      width,
      height,
      line.quad,
      line.crop,
      lineWidth,
      REC_HEIGHT,
    );
    for (let channel = 0; channel < 3; channel += 1) {
      for (let y = 0; y < REC_HEIGHT; y += 1) {
        const sourceRow = channel * lineWidth * REC_HEIGHT + y * lineWidth;
        const targetRow = slot * 3 * plane + channel * plane + y * tensorWidth;
        for (let x = 0; x < lineWidth; x += 1) {
          data[targetRow + x] = (planes[sourceRow + x] as number) / 127.5 - 1;
        }
      }
    }
  });
  return { data, dims: [batch.length, 3, REC_HEIGHT, tensorWidth] };
}

export interface DecodedLine {
  text: string;
  score: number;
}

/**
 * Greedy CTC over `[batch, steps, classes]`. Class 0 is the blank; class `i` past it is
 * `alphabet[i - 1]`, where the alphabet is the model's character list with a space appended.
 */
export function decodeCtc(
  output: Float32Array,
  dims: readonly number[],
  alphabet: readonly string[],
): DecodedLine[] {
  const [batch = 0, steps = 0, classes = 0] = dims;
  const lines: DecodedLine[] = [];
  for (let item = 0; item < batch; item += 1) {
    let text = "";
    let total = 0;
    let count = 0;
    let previous = -1;
    for (let step = 0; step < steps; step += 1) {
      const offset = (item * steps + step) * classes;
      let best = 0;
      let bestValue = -Infinity;
      for (let cls = 0; cls < classes; cls += 1) {
        const value = output[offset + cls] as number;
        if (value > bestValue) {
          bestValue = value;
          best = cls;
        }
      }
      if (best !== 0 && best !== previous) {
        const character = alphabet[best - 1];
        if (character !== undefined) {
          text += character;
          total += bestValue;
          count += 1;
        }
      }
      previous = best;
    }
    lines.push({ text, score: count === 0 ? 0 : total / count });
  }
  return lines;
}
