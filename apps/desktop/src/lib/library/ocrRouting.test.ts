/**
 * Purpose: the page decides its engine — the main recognizer's confidence says whether it knew
 * the script, a blank page is not sent anywhere, and the interface language only orders the
 * tesseract candidates.
 */
import { describe, expect, it } from "vitest";
import { candidateLanguages, hasInk, primaryReadsPage } from "./ocrRouting";

describe("primaryReadsPage", () => {
  it("accepts the confidence a page in a covered script gets", () => {
    // zh_dlbook and en_openstax scan pages: mean 0.97–1.00 with a few lines under 0.8.
    expect(
      primaryReadsPage([{ score: 0.99 }, { score: 0.98 }, { score: 0.72 }, { score: 0.995 }]),
    ).toBe(true);
  });
  it("refuses what a Hindi or Arabic page gets", () => {
    // hi_godaan: 5–11 lines averaging 0.55–0.64; ar_ibnkhaldun: 0.63.
    expect(
      primaryReadsPage([{ score: 0.61 }, { score: 0.7 }, { score: 0.52 }, { score: 0.66 }]),
    ).toBe(false);
  });
  it("does not call an empty page read", () => {
    expect(primaryReadsPage([])).toBe(false);
  });
});

describe("hasInk", () => {
  const page = (dark: number) => {
    const pixels = 8000;
    const rgba = new Uint8Array(pixels * 4).fill(255);
    for (let index = 0; index < dark; index += 1) rgba.set([20, 20, 20, 255], index * 8 * 4);
    return { width: 100, height: 80, rgba };
  };
  it("sees a page with text on it and not a blank one", () => {
    expect(hasInk(page(0))).toBe(false);
    expect(hasInk(page(1))).toBe(false);
    expect(hasInk(page(40))).toBe(true);
  });
});

describe("candidateLanguages", () => {
  it("puts the interface language's data first and the other two after", () => {
    expect(candidateLanguages("bn-BD").map((language) => language.code)).toEqual([
      "ben",
      "hin",
      "ara",
    ]);
    expect(candidateLanguages("ar").map((language) => language.code)).toEqual([
      "ara",
      "hin",
      "ben",
    ]);
  });
  it("offers all three, in a fixed order, to every other interface", () => {
    expect(candidateLanguages("zh-CN").map((language) => language.code)).toEqual([
      "hin",
      "ben",
      "ara",
    ]);
  });
});
