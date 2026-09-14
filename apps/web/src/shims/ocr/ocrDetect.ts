/**
 * Purpose: the two halves of text detection that are not the model — the page into the
 * tensor the detector takes, and the detector's probability map into boxes around lines.
 *
 * Both follow PaddleOCR's own defaults rather than any port's. The page is not shrunk (the
 * official `limit_side_len: 64, limit_type: min` only ever enlarges a tiny image), only
 * rounded to a multiple of 32 and capped at 4000 px; the map is thresholded at 0.3, a box
 * is kept when the map averages 0.6 inside it, and it is grown by an unclip ratio of 1.5.
 * The research note measured what the alternatives cost: a port's dilation and looser
 * thresholds fused neighbouring lines on dense pages and took one English textbook from 0.3%
 * character error to 5.5%.
 *
 * Regions come from a flood fill over the thresholded map instead of OpenCV's contour tracing.
 * A region's boundary pixels are what the rectangle is fitted to, which is the same set of
 * points a contour would give, and holes inside a region are simply not separate regions —
 * OpenCV lists them and PaddleOCR then discards them by score, so nothing is lost.
 * Main exports: DET_DEFAULTS, detectorInputSize, detectorTensor, boxesFromMap, sortBoxes.
 */
import {
  expandQuad,
  meanInsideQuad,
  minAreaRect,
  type Point,
  type Quad,
  quadSide,
} from "./ocrGeometry";
import { resizeRgbaToBgrPlanes } from "./ocrImage";

export const DET_DEFAULTS = {
  thresh: 0.3,
  boxThresh: 0.6,
  unclipRatio: 1.5,
  maxCandidates: 1000,
  /** A box narrower than this, before growing, is a speck; after growing, narrower than
   * `minSize + 2` is too. Both are PaddleOCR's numbers. */
  minSize: 3,
  maxSide: 4000,
  limitSideLen: 64,
} as const;

/** ImageNet statistics, applied to the channels in BGR order exactly as PaddleOCR does. */
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

/** `DetResizeForTest` type 0 with `limit_type: min`: enlarge only when the short side is under
 * the limit, round both sides to multiples of 32, then cap the long side. */
export function detectorInputSize(
  width: number,
  height: number,
): { width: number; height: number } {
  const shortSide = Math.min(width, height);
  const scale = shortSide < DET_DEFAULTS.limitSideLen ? DET_DEFAULTS.limitSideLen / shortSide : 1;
  const round32 = (value: number) => Math.max(32, Math.round(value / 32) * 32);
  let dstWidth = round32(width * scale);
  let dstHeight = round32(height * scale);
  const longSide = Math.max(dstWidth, dstHeight);
  if (longSide > DET_DEFAULTS.maxSide) {
    const shrink = DET_DEFAULTS.maxSide / longSide;
    dstWidth = round32(Math.floor(dstWidth * shrink));
    dstHeight = round32(Math.floor(dstHeight * shrink));
  }
  return { width: dstWidth, height: dstHeight };
}

/** The page as the detector's `[1, 3, H, W]` input: resized, BGR, normalized. */
export function detectorTensor(
  rgba: Uint8Array,
  width: number,
  height: number,
  target: { width: number; height: number },
): Float32Array {
  const planes = resizeRgbaToBgrPlanes(rgba, width, height, target.width, target.height);
  const plane = target.width * target.height;
  const tensor = new Float32Array(3 * plane);
  for (let channel = 0; channel < 3; channel += 1) {
    const mean = MEAN[channel] as number;
    const std = STD[channel] as number;
    const offset = channel * plane;
    for (let index = 0; index < plane; index += 1) {
      tensor[offset + index] = ((planes[offset + index] as number) / 255 - mean) / std;
    }
  }
  return tensor;
}

/** The boundary pixels of every 8-connected region of the thresholded map, region by region,
 * in the order their first pixel is met scanning down the page. */
function boundaryPoints(mask: Uint8Array, width: number, height: number): Point[][] {
  const seen = new Uint8Array(mask.length);
  const regions: Point[][] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || seen[start] === 1) continue;
    const boundary: Point[] = [];
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const index = stack.pop() as number;
      const x = index % width;
      const y = (index - x) / width;
      let onEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] === 0) {
            if (dx === 0 || dy === 0) onEdge = true;
            continue;
          }
          if (seen[next] === 0) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
      if (onEdge) boundary.push([x, y]);
    }
    regions.push(boundary);
  }
  return regions;
}

/**
 * `DBPostProcess.boxes_from_bitmap` for quad boxes. The map is the detector's output at its
 * own resolution; the boxes come back in the page's pixel coordinates, rounded and clamped.
 */
export function boxesFromMap(
  map: Float32Array,
  mapWidth: number,
  mapHeight: number,
  page: { width: number; height: number },
  params = DET_DEFAULTS,
): Quad[] {
  const mask = new Uint8Array(map.length);
  for (let index = 0; index < map.length; index += 1) {
    mask[index] = (map[index] as number) > params.thresh ? 1 : 0;
  }
  const boxes: Quad[] = [];
  const regions = boundaryPoints(mask, mapWidth, mapHeight).slice(0, params.maxCandidates);
  for (const region of regions) {
    const box = minAreaRect(region);
    if (quadSide(box) < params.minSize) continue;
    if (meanInsideQuad(map, mapWidth, mapHeight, box) < params.boxThresh) continue;
    const grown = expandQuad(box, params.unclipRatio);
    if (quadSide(grown) < params.minSize + 2) continue;
    const clamp = (value: number, max: number) => Math.min(max, Math.max(0, Math.round(value)));
    boxes.push(
      grown.map(([x, y]) => [
        clamp((x * page.width) / mapWidth, page.width),
        clamp((y * page.height) / mapHeight, page.height),
      ]) as unknown as Quad,
    );
  }
  return boxes;
}

/** PaddleOCR's `sorted_boxes`: top to bottom, and boxes that start on the same line left to
 * right — so two columns of a table read across a row rather than down a column. "Same line"
 * is PaddleOCR's ten pixels, or half the shorter box's height where that is more: at 200 dpi
 * a heading is fifty pixels tall, and two boxes of one heading can start twelve pixels apart. */
export function sortBoxes(boxes: readonly Quad[]): Quad[] {
  const height = (quad: Quad) => Math.abs(quad[3][1] - quad[0][1]);
  const sameLine = (a: Quad, b: Quad) =>
    Math.abs(a[0][1] - b[0][1]) < Math.max(10, 0.5 * Math.min(height(a), height(b)));
  const sorted = [...boxes].sort((a, b) => a[0][1] - b[0][1] || a[0][0] - b[0][0]);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    for (let j = i; j >= 0; j -= 1) {
      const lower = sorted[j + 1] as Quad;
      const upper = sorted[j] as Quad;
      if (sameLine(lower, upper) && lower[0][0] < upper[0][0]) {
        sorted[j] = lower;
        sorted[j + 1] = upper;
      } else break;
    }
  }
  return sorted;
}
