import { describe, expect, it } from "vitest";
import { specificValues, ungroundedValues, valueOccursIn } from "./values";

describe("specificValues", () => {
  it("carries the unit a CJK measure word supplies, spaced or not", () => {
    expect(specificValues("高 8848.86 米")).toEqual([
      { number: "8848.86", unit: "米", text: "8848.86米" },
    ]);
    expect(specificValues("高8848.86米")[0]?.unit).toBe("米");
  });

  it("does not read the next English word as a unit", () => {
    expect(specificValues("in 1953 the summit")[0]).toEqual({
      number: "1953",
      unit: "",
      text: "1953",
    });
    expect(specificValues("50km of road")[0]?.unit).toBe("km");
  });

  it("ignores list numbering, which is layout rather than a claim", () => {
    expect(specificValues("1. 先量气压")).toEqual([]);
  });

  it("de-duplicates repeated figures", () => {
    expect(specificValues("8848 米，还是 8848 米")).toHaveLength(1);
  });
});

describe("valueOccursIn", () => {
  it("ignores whitespace and thousands separators", () => {
    const [value] = specificValues("29,031.7 英尺");
    expect(value).toBeDefined();
    if (value === undefined) return;
    expect(valueOccursIn(value, "海拔 29031.7 英尺")).toBe(true);
  });
});

describe("ungroundedValues — check one", () => {
  const passages = ["珠穆朗玛峰的高度为 8848.86 米。"];

  it("passes a figure that is in the sources", () => {
    expect(ungroundedValues("它高 8848.86 米。", "珠峰多高", passages)).toEqual([]);
  });

  it("passes a figure the learner supplied in the question", () => {
    expect(ungroundedValues("你说的 1975 年那次测量。", "1975 年那次呢", passages)).toEqual([]);
  });

  it("catches a figure that appears nowhere but the reply", () => {
    expect(
      ungroundedValues("误差大约是 0.21 米。", "珠峰多高", passages).map((value) => value.text),
    ).toEqual(["0.21米"]);
  });
});

describe("a unit is a unit, not the rest of the sentence", () => {
  it("stops before prose that merely continues in the same script", () => {
    // 「8 日中国和尼泊尔共同宣布」 once produced a figure of 8 measured in 「日中国」, which made the
    // conflict detector compare units that do not exist.
    const values = specificValues("这是 2020 年 12 月 8 日中国和尼泊尔共同宣布的结果");
    expect(values.map((value) => value.text)).toEqual(["2020年", "12月", "8"]);
  });

  it("keeps a real two-character unit", () => {
    expect(specificValues("高 8848.86 公尺。")[0]?.unit).toBe("公尺");
  });
});
