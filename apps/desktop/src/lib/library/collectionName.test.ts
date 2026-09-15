/**
 * Purpose: the naming rule, on the titles it was written for — shared stems in Chinese and
 * in a spaced script, the volume words that must not be part of a name, and the fallback
 * that lists members when there is no stem.
 */
import { describe, expect, it } from "vitest";
import { autoCollectionName, type NameFallback, sharedTitlePrefix } from "./collectionName";

const fallback: NameFallback = {
  pair: (a, b) => `${a}、${b}`,
  more: (a, b, count) => `${a}、${b} 等 ${count} 份`,
};

describe("the shared prefix of the titles", () => {
  it("is the stem two volumes of one work share", () => {
    expect(sharedTitlePrefix(["高等数学上册", "高等数学下册"])).toBe("高等数学");
    expect(sharedTitlePrefix(["线性代数（第七版）", "线性代数习题全解"])).toBe("线性代数");
    expect(sharedTitlePrefix(["Calculus Volume 1", "Calculus Volume 2"])).toBe("Calculus");
  });

  it("stops on a word boundary in a spaced script", () => {
    expect(sharedTitlePrefix(["Introduction to Algorithms", "Intro to Statistics"])).toBe("");
    expect(sharedTitlePrefix(["Deep Learning Book", "Deep Learning Notes"])).toBe("Deep Learning");
  });

  it("is empty for one title, a single shared character, or nothing shared", () => {
    expect(sharedTitlePrefix(["高等数学"])).toBe("");
    expect(sharedTitlePrefix(["中华人民共和国宪法", "中学物理"])).toBe("");
    expect(sharedTitlePrefix(["呐喊", "宪法"])).toBe("");
  });
});

describe("the name a collection gets", () => {
  it("is the stem when there is one", () => {
    expect(autoCollectionName(["高等数学上册", "高等数学下册", "高等数学习题"], fallback)).toBe(
      "高等数学",
    );
  });

  it("lists two members, or two members and a count, when there is none", () => {
    expect(autoCollectionName(["呐喊", "宪法"], fallback)).toBe("呐喊、宪法");
    expect(autoCollectionName(["呐喊", "宪法", "彷徨"], fallback)).toBe("呐喊、宪法 等 3 份");
  });
});
