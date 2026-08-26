/**
 * Purpose: hunt for the ways a word cloud goes wrong — words on top of each other, words
 * off the canvas, a redraw that jumps around, a single word, hundreds of identical counts.
 * The assertions are tripwires on invariants, not on pixel positions.
 */
import { describe, expect, it } from "vitest";
import type { CloudWord } from "./schemas";
import { layoutWordCloud, valenceColor, wordFontWeight } from "./wordCloudLayout";

/** Stand-in for canvas measurement: CJK glyphs are square, latin ones about half as wide. */
const measureWidth = (text: string, fontSize: number) =>
  [...text].reduce(
    (sum, char) => sum + (char.charCodeAt(0) > 0x2e80 ? fontSize : fontSize * 0.55),
    0,
  );

const layout = (words: CloudWord[], width = 860, height = 380) =>
  layoutWordCloud({ words, width, height, measureWidth });

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function wordsWithCounts(counts: number[]): CloudWord[] {
  return counts.map((n, index) => ({ w: `词${index}`, n, valence: (index % 5) - 2 }));
}

describe("word cloud layout", () => {
  it("keeps every placed word inside the canvas and off every other word", () => {
    const counts = Array.from({ length: 80 }, (_, index) => 200 - index * 2);
    const placed = layout(wordsWithCounts(counts));
    expect(placed.length).toBeGreaterThan(30);
    for (const word of placed) {
      expect(word.x).toBeGreaterThanOrEqual(0);
      expect(word.y).toBeGreaterThanOrEqual(0);
      expect(word.x + word.width).toBeLessThanOrEqual(860);
      expect(word.y + word.height).toBeLessThanOrEqual(380);
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(overlaps(placed[i] as never, placed[j] as never)).toBe(false);
      }
    }
  });

  it("draws the same cloud twice in a row", () => {
    const words = wordsWithCounts([90, 70, 55, 40, 33, 21, 13, 9, 5, 3, 2, 1]);
    expect(layout(words)).toEqual(layout(words));
  });

  it("never gives a rarer word a bigger font than a common one", () => {
    const placed = layout(wordsWithCounts([300, 120, 60, 30, 12, 6, 3, 1]));
    const sizes = placed.map((word) => word.fontSize);
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i] as number).toBeLessThanOrEqual(sizes[i - 1] as number);
    }
    expect(wordFontWeight(sizes[0] as number)).toBeGreaterThanOrEqual(
      wordFontWeight(sizes.at(-1) as number),
    );
  });

  it("survives the degenerate inputs a quiet week produces", () => {
    expect(layout([])).toEqual([]);
    expect(layout(wordsWithCounts([1])).length).toBe(1);
    expect(layout(wordsWithCounts([4, 4, 4, 4, 4])).length).toBe(5);
    // A canvas too small for anything must drop words rather than draw them outside.
    for (const word of layout(wordsWithCounts([50, 40, 30]), 40, 30)) {
      expect(word.x + word.width).toBeLessThanOrEqual(40);
    }
  });

  it("colours by how the content felt, clamped at both ends", () => {
    expect(valenceColor(0)).toBe("rgb(122,121,117)");
    expect(valenceColor(2)).toBe(valenceColor(9));
    expect(valenceColor(-2)).toBe(valenceColor(-9));
    expect(valenceColor(2)).not.toBe(valenceColor(-2));
  });
});
