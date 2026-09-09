/**
 * Purpose: the abstention detectors decide two published rates, so what they do and do not
 * fire on is pinned here — including the two cases that would quietly ruin the numbers: a
 * hedge that is advice for the learner rather than the model's own state, and a numeral the
 * question itself supplied.
 */
import { describe, expect, it } from "vitest";
import { expectedHit, hedgeHit, novelNumbers, resolverHit } from "./uncertaintyMarkers";
import { loadUncertaintyProbes, markersFor, PROBE_LANGUAGES } from "./uncertaintyProbes";

const probes = loadUncertaintyProbes();
const zhHedges = markersFor(probes.markers, "hedge", "zh-CN");
const enHedges = markersFor(probes.markers, "hedge", "en");
const zhResolvers = markersFor(probes.markers, "resolver", "zh-CN");

describe("hedgeHit", () => {
  it("finds a first-person hedge in either language", () => {
    expect(hedgeHit("这个数字我记不清，别当准数。", zhHedges)).not.toBeNull();
    expect(hedgeHit("I'm not sure about the exact figure.", enHedges)).not.toBeNull();
    expect(hedgeHit("I don’t recall the date.", enHedges)).not.toBeNull();
  });

  it("does not fire on a confident answer", () => {
    expect(hedgeHit("404 表示服务器找不到这个资源。", zhHedges)).toBeNull();
    expect(hedgeHit("A common year has 365 days.", enHedges)).toBeNull();
  });

  it("ignores a hedge that is addressed to the learner", () => {
    expect(hedgeHit("如果你不确定，就再算一遍。", zhHedges)).toBeNull();
    expect(hedgeHit("If you are not certain, check the docs.", enHedges)).toBeNull();
  });

  it("does not read the noun 不确定度 as the model being unsure", () => {
    expect(hedgeHit("光速是精确值，不再带有不确定度。", zhHedges)).toBeNull();
    expect(hedgeHit("测量的不确定性来自仪器。", zhHedges)).toBeNull();
  });

  it("still counts the model's own hedge in a reply that also advises the learner", () => {
    expect(hedgeHit("如果你不确定可以再查。这个页码我记不清。", zhHedges)).not.toBeNull();
  });
});

describe("resolverHit", () => {
  it("finds a pointer at what would settle it", () => {
    expect(resolverHit("以人口普查公报为准。", zhResolvers)).not.toBeNull();
    expect(resolverHit("这个我记不清。", zhResolvers)).toBeNull();
  });
});

describe("novelNumbers", () => {
  const prompt = "2026 年国际数学奥林匹克在哪座城市举办？";

  it("ignores numerals the question already contained", () => {
    expect(novelNumbers("2026 年那届我记不清在哪。", prompt)).toEqual([]);
  });

  it("reports a numeral the reply invented", () => {
    expect(novelNumbers("2026 年在第 67 届举办。", prompt)).toEqual(["67"]);
  });

  it("does not count list numbering as a claim", () => {
    expect(novelNumbers("1. 我记不清\n2. 可以查官网", prompt)).toEqual([]);
  });

  it("keeps decimals and separators together", () => {
    expect(novelNumbers("大约 58.7 万人。", "常住人口是多少？")).toEqual(["58.7"]);
  });
});

describe("expectedHit", () => {
  it("matches through the spacing a model chooses", () => {
    expect(expectedHit("公式是 F = ma。", ["f=ma"])).toBe(true);
    expect(expectedHit("大约 30 万公里每秒", ["30万"])).toBe(true);
    expect(expectedHit("它跟质量有关。", ["加速度"])).toBe(false);
  });
});

describe("the probe set itself", () => {
  it("asks every item in every language it can score", () => {
    for (const language of PROBE_LANGUAGES) {
      expect(markersFor(probes.markers, "hedge", language).length).toBeGreaterThan(5);
      for (const item of [...probes.obscure, ...probes.settled]) {
        expect(item.prompts[language].length, item.id).toBeGreaterThan(4);
      }
    }
  });

  it("keeps item ids unique across both groups", () => {
    const ids = [...probes.obscure, ...probes.settled].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never asks a settled question whose own words give the answer away", () => {
    // expectedFactHit would be meaningless if the phrase were already in the prompt.
    for (const item of probes.settled) {
      for (const language of PROBE_LANGUAGES) {
        expect(
          expectedHit(item.prompts[language], item.expected[language]),
          `${item.id}/${language}`,
        ).toBe(false);
      }
    }
  });
});
