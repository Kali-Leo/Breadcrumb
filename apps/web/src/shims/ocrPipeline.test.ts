/**
 * Purpose: the parts of text recognition that are ours rather than the model's — the
 * geometry that stands in for OpenCV, the detector's post-processing, the reading order, the
 * crop, and the CTC decoding. Each is checked against what PaddleOCR would compute for the
 * same input, because a quiet disagreement here reads as a worse model, not as a bug.
 */
import { describe, expect, it } from "vitest";
import {
  boxesFromMap,
  DET_DEFAULTS,
  detectorInputSize,
  detectorTensor,
  sortBoxes,
} from "./ocr/ocrDetect";
import {
  convexHull,
  expandQuad,
  meanInsideQuad,
  minAreaRect,
  orderQuad,
  type Quad,
  quadSide,
} from "./ocr/ocrGeometry";
import { lineCropOf, resizeRgbaToBgrPlanes, sampleQuadToBgrPlanes } from "./ocr/ocrImage";
import { decodeCtc, planRecognitionBatches, recognitionTensor } from "./ocr/ocrRecognize";

const near = (a: number, b: number, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

describe("geometry in place of OpenCV", () => {
  it("fits the smallest rectangle around an axis-aligned block of pixels", () => {
    const points: [number, number][] = [];
    for (let y = 10; y <= 20; y += 1) for (let x = 5; x <= 60; x += 1) points.push([x, y]);
    const box = minAreaRect(points);
    expect(box.map(([x, y]) => [Math.round(x), Math.round(y)])).toEqual([
      [5, 10],
      [60, 10],
      [60, 20],
      [5, 20],
    ]);
    expect(near(quadSide(box), 10)).toBe(true);
  });

  it("follows a slanted line rather than boxing its bounding rectangle", () => {
    // A thin bar rotated 30 degrees: the minimal rectangle is the bar, not its AABB.
    const points: [number, number][] = [];
    const [c, s] = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)];
    for (let u = 0; u <= 100; u += 1) {
      for (let v = -3; v <= 3; v += 1) points.push([100 + u * c - v * s, 100 + u * s + v * c]);
    }
    const box = minAreaRect(points);
    expect(near(quadSide(box), 6, 0.5)).toBe(true);
    const long = Math.hypot(box[1][0] - box[0][0], box[1][1] - box[0][1]);
    expect(near(long, 100, 0.5)).toBe(true);
  });

  it("orders corners top-left, top-right, bottom-right, bottom-left", () => {
    expect(
      orderQuad([
        [9, 9],
        [0, 1],
        [9, 0],
        [0, 8],
      ]),
    ).toEqual([
      [0, 1],
      [9, 0],
      [9, 9],
      [0, 8],
    ]);
    expect(
      convexHull([
        [0, 0],
        [2, 0],
        [1, 0.5],
        [2, 2],
        [0, 2],
      ]),
    ).toHaveLength(4);
  });

  it("grows a box by area × ratio ÷ perimeter on every side, as unclip does", () => {
    const box: Quad = [
      [0, 0],
      [100, 0],
      [100, 20],
      [0, 20],
    ];
    const grown = expandQuad(box, 1.5);
    const distance = (100 * 20 * 1.5) / 240;
    expect(near(grown[0][0], -distance)).toBe(true);
    expect(near(grown[2][1], 20 + distance)).toBe(true);
    expect(near(quadSide(grown), 20 + 2 * distance)).toBe(true);
  });

  it("averages the map inside the box and nowhere else", () => {
    const map = new Float32Array(10 * 10);
    for (let y = 2; y <= 4; y += 1) for (let x = 1; x <= 6; x += 1) map[y * 10 + x] = 0.8;
    expect(
      near(
        meanInsideQuad(map, 10, 10, [
          [1, 2],
          [6, 2],
          [6, 4],
          [1, 4],
        ]),
        0.8,
      ),
    ).toBe(true);
    expect(
      meanInsideQuad(map, 10, 10, [
        [7, 7],
        [9, 7],
        [9, 9],
        [7, 9],
      ]),
    ).toBe(0);
  });
});

describe("detector pre- and post-processing", () => {
  it("does not shrink a 200 dpi page, only rounds it to 32 and caps it at 4000", () => {
    expect(detectorInputSize(1654, 2339)).toEqual({ width: 1664, height: 2336 });
    expect(detectorInputSize(40, 3000)).toEqual({ width: 64, height: 4800 - 800 });
    expect(detectorInputSize(9000, 9000).width).toBeLessThanOrEqual(DET_DEFAULTS.maxSide);
  });

  it("normalizes with the ImageNet statistics in BGR order", () => {
    const rgba = new Uint8Array([255, 0, 0, 255]);
    const tensor = detectorTensor(rgba, 1, 1, { width: 1, height: 1 });
    // Channel 0 is blue (0 here), channel 2 is red (255).
    expect(near(tensor[0] as number, (0 - 0.485) / 0.229)).toBe(true);
    expect(near(tensor[2] as number, (1 - 0.406) / 0.225)).toBe(true);
  });

  it("turns a bright region of the map into one box grown around it, scaled to the page", () => {
    const [width, height] = [64, 32];
    const map = new Float32Array(width * height);
    for (let y = 10; y < 16; y += 1) for (let x = 8; x < 40; x += 1) map[y * width + x] = 0.9;
    const boxes = boxesFromMap(map, width, height, { width: 128, height: 64 });
    expect(boxes).toHaveLength(1);
    const [box] = boxes as [Quad];
    // Around the core (16..80 by 20..30 on the page), grown outward by unclip 1.5.
    expect(box[0][0]).toBeLessThan(16);
    expect(box[1][0]).toBeGreaterThan(80);
    expect(box[0][1]).toBeLessThan(20);
    expect(box[2][1]).toBeGreaterThan(30);
  });

  it("drops a region whose map is not confident enough, and a speck", () => {
    const map = new Float32Array(64 * 32);
    for (let y = 10; y < 16; y += 1) for (let x = 8; x < 40; x += 1) map[y * 64 + x] = 0.4;
    map[5 * 64 + 50] = 0.99;
    expect(boxesFromMap(map, 64, 32, { width: 64, height: 32 })).toHaveLength(0);
  });

  it("reads a heading's two boxes left to right even when their tops differ", () => {
    const chapter: Quad = [
      [100, 112],
      [250, 112],
      [250, 162],
      [100, 162],
    ];
    const title: Quad = [
      [280, 100],
      [380, 100],
      [380, 162],
      [280, 162],
    ];
    const body: Quad = [
      [60, 200],
      [900, 200],
      [900, 230],
      [60, 230],
    ];
    expect(sortBoxes([body, title, chapter])).toEqual([chapter, title, body]);
  });
});

describe("line crops and CTC decoding", () => {
  it("turns a tall box a quarter turn and reads a wide one as it is", () => {
    expect(
      lineCropOf([
        [0, 0],
        [20, 0],
        [20, 60],
        [0, 60],
      ]).rotated,
    ).toBe(true);
    expect(
      lineCropOf([
        [0, 0],
        [200, 0],
        [200, 30],
        [0, 30],
      ]).rotated,
    ).toBe(false);
  });

  it("samples the page inside the box, in BGR", () => {
    // A 4×2 page: left half red, right half blue.
    const rgba = new Uint8Array(4 * 2 * 4);
    for (let i = 0; i < 8; i += 1) {
      const red = i % 4 < 2;
      rgba.set([red ? 255 : 0, 0, red ? 0 : 255, 255], i * 4);
    }
    const quad: Quad = [
      [0, 0],
      [4, 0],
      [4, 2],
      [0, 2],
    ];
    const planes = sampleQuadToBgrPlanes(rgba, 4, 2, quad, lineCropOf(quad), 4, 2);
    // Blue plane: right half lit; red plane: left half lit.
    expect(planes[0]).toBe(0);
    expect(planes[3]).toBe(255);
    expect(planes[16]).toBe(255);
    expect(planes[19]).toBe(0);
    expect(resizeRgbaToBgrPlanes(rgba, 4, 2, 2, 1)).toHaveLength(6);
  });

  it("batches by aspect ratio, six at a time, padding to the widest of the batch", () => {
    const boxes: Quad[] = Array.from({ length: 8 }, (_unused, i) => [
      [0, i * 50],
      [48 * (i + 1), i * 50],
      [48 * (i + 1), i * 50 + 48],
      [0, i * 50 + 48],
    ]);
    const batches = planRecognitionBatches(boxes);
    expect(batches.map((batch) => batch.length)).toEqual([6, 2]);
    const rgba = new Uint8Array(400 * 400 * 4).fill(255);
    const tensor = recognitionTensor(rgba, 400, 400, batches[0] as never);
    // Six lines, the widest 6:1, but never narrower than the model's 320/48.
    expect(tensor.dims).toEqual([6, 3, 48, 320]);
    expect(tensor.data[0]).toBe(1);
    expect(tensor.data[tensor.data.length - 1]).toBe(0);
  });

  it("collapses blanks and repeats and scores by the characters kept", () => {
    const alphabet = ["a", "b", " "];
    // Steps: a a blank b b blank space → "ab " with scores from the kept steps.
    const steps = [
      [0.1, 0.9, 0, 0],
      [0.1, 0.8, 0, 0],
      [1, 0, 0, 0],
      [0, 0, 0.7, 0],
      [0, 0, 0.6, 0],
      [1, 0, 0, 0],
      [0, 0, 0, 0.5],
    ];
    const output = new Float32Array(steps.flat());
    const [line] = decodeCtc(output, [1, steps.length, 4], alphabet);
    expect(line?.text).toBe("ab ");
    expect(near(line?.score ?? 0, (0.9 + 0.7 + 0.5) / 3)).toBe(true);
  });
});
