/**
 * Purpose: tests for vocabulary calibration — deterministic band sampling, known-count
 * estimation, floor placement at the knowledge boundary, and edge cases (spec 033 增补).
 */
import { describe, expect, it } from "vitest";
import { type CalibrationWord, estimateCalibration, sampleCalibrationWords } from "./calibration";
import { loadLanguagePack } from "./packSchema";

function makePack(count: number) {
  const entries: Record<string, unknown> = {};
  for (let i = 0; i < count; i += 1) {
    entries[`w${String(i).padStart(3, "0")}`] = {
      target: `t${i}`,
      pos: "n",
      reading: "",
      altTargets: [],
      freqRank: i + 1,
      t1Safe: true,
    };
  }
  return loadLanguagePack({
    schemaVersion: 1,
    id: "zh:en",
    sourceLang: "zh",
    targetLang: "en",
    version: "test",
    attribution: ["x"],
    capabilities: { t1Safe: true, rtl: false, ruby: false },
    forms: {},
    entries,
  });
}

describe("sampleCalibrationWords", () => {
  it("samples evenly across bands, deterministic and in-queue", () => {
    const loaded = makePack(400);
    const samples = sampleCalibrationWords(loaded, 8, 5);
    expect(samples).toHaveLength(40);
    expect(new Set(samples.map((s) => s.band)).size).toBe(8);
    expect(samples).toEqual(sampleCalibrationWords(loaded, 8, 5));
    for (const sample of samples) {
      expect(loaded.introductionQueue[sample.rank]).toBe(sample.lemma);
    }
  });

  it("returns empty for an empty queue", () => {
    expect(sampleCalibrationWords(makePack(0), 8, 5)).toEqual([]);
  });
});

describe("estimateCalibration", () => {
  const answer = (band: number, known: boolean): CalibrationWord & { known: boolean } => ({
    lemma: "x",
    target: "y",
    rank: 0,
    band,
    known,
  });

  it("places the floor where the known rate first drops", () => {
    // 4 bands over 400 words: bands 0-1 fully known, band 2 half known, band 3 unknown.
    const answers = [
      ...[true, true].flatMap((_, band) => [answer(band, true), answer(band, true)]),
      answer(2, true),
      answer(2, false),
      answer(3, false),
      answer(3, false),
    ];
    const result = estimateCalibration(answers, 400);
    expect(result.introductionRankFloor).toBe(200); // band 2 starts at rank 200
    expect(result.estimatedKnownCount).toBe(250); // 100 + 100 + 50 + 0
  });

  it("starts at zero when even the first band is shaky", () => {
    const answers = [answer(0, false), answer(0, false), answer(1, false), answer(1, false)];
    expect(estimateCalibration(answers, 100).introductionRankFloor).toBe(0);
  });

  it("caps the floor at the last band when everything is known", () => {
    const answers = [answer(0, true), answer(1, true), answer(2, true), answer(3, true)];
    expect(estimateCalibration(answers, 400).introductionRankFloor).toBe(300);
  });

  it("handles empty input", () => {
    expect(estimateCalibration([], 100)).toEqual({
      estimatedKnownCount: 0,
      introductionRankFloor: 0,
    });
  });
});
