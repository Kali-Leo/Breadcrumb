/**
 * Purpose: pins the similarity primitives every purpose's comparator is built on — the
 * boundary cases that decide whether a score means anything: two empty sets agree, an empty
 * set against a full one does not, and a tier one step away is not the same as a tier three
 * steps away.
 */
import { describe, expect, it } from "vitest";
import {
  bigramCoverage,
  diceBigram,
  exactSetF1,
  fuzzySetF1,
  meanScore,
  normaliseLabel,
  ordinalAgreement,
  ratioScore,
} from "./textSimilarity";

describe("normaliseLabel", () => {
  it("folds case and collapses whitespace, keeping punctuation", () => {
    expect(normaliseLabel("  Array  Map  ")).toBe("array map");
    expect(normaliseLabel("map()")).not.toBe(normaliseLabel("map"));
  });
});

describe("diceBigram", () => {
  it("scores identity 1 and unrelated text near 0", () => {
    expect(diceBigram("引力透镜", "引力透镜")).toBe(1);
    expect(diceBigram("引力透镜", "事件循环")).toBeLessThan(0.2);
  });

  it("works the same on a script with no spaces and one with", () => {
    expect(diceBigram("event loop", "event loops")).toBeGreaterThan(0.8);
  });

  it("treats two single characters as equal only when they match", () => {
    expect(diceBigram("A", "A")).toBe(1);
    expect(diceBigram("A", "B")).toBe(0);
  });
});

describe("bigramCoverage", () => {
  it("is 1 when the part is drawn from the whole and low when it is not", () => {
    expect(bigramCoverage("闭包", "闭包记住了定义时的作用域")).toBe(1);
    expect(bigramCoverage("量子隧穿", "闭包记住了定义时的作用域")).toBe(0);
  });
});

describe("exactSetF1", () => {
  it("counts two empty sets as full agreement", () => {
    expect(exactSetF1([], [])).toBe(1);
  });

  it("scores nothing for an empty answer against a real one", () => {
    expect(exactSetF1(["a"], [])).toBe(0);
  });

  it("penalises both misses and extras", () => {
    expect(exactSetF1(["a", "b"], ["a", "b"])).toBe(1);
    expect(exactSetF1(["a", "b"], ["a", "c"])).toBeCloseTo(0.5);
  });
});

describe("fuzzySetF1", () => {
  it("matches near-identical phrasings that exact comparison would miss", () => {
    expect(exactSetF1(["gravitational lensing"], ["gravitational lens"])).toBe(0);
    expect(fuzzySetF1(["gravitational lensing"], ["gravitational lens"])).toBe(1);
  });

  it("never matches one candidate to two references", () => {
    expect(fuzzySetF1(["closures", "closure"], ["closures"])).toBeCloseTo(2 / 3);
  });
});

describe("ordinalAgreement", () => {
  const tiers = ["none", "weak", "medium", "strong"];

  it("falls with distance and rejects a value off the scale", () => {
    expect(ordinalAgreement(tiers, "weak", "weak")).toBe(1);
    expect(ordinalAgreement(tiers, "none", "weak")).toBeCloseTo(2 / 3);
    expect(ordinalAgreement(tiers, "none", "strong")).toBe(0);
    expect(ordinalAgreement(tiers, "none", "轻微")).toBe(0);
  });
});

describe("ratioScore and meanScore", () => {
  it("treat an empty denominator as nothing-to-fail rather than zero", () => {
    expect(ratioScore(0, 0)).toBe(1);
    expect(meanScore([])).toBe(1);
    expect(ratioScore(1, 4)).toBe(0.25);
    expect(meanScore([1, 0])).toBe(0.5);
  });
});
