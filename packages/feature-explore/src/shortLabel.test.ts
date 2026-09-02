/**
 * Purpose: the station-label shortener replaced an LLM call, so these check it does the one
 * thing that mattered about that call — produce something readable — and, more importantly,
 * that it declines rather than mangling a label it cannot shorten honestly.
 */
import { describe, expect, it } from "vitest";
import { RAW_LABEL_SHORT_ENOUGH, shortenStationLabel } from "./shortLabel";

describe("shortenStationLabel", () => {
  it("leaves a label that already fits alone", () => {
    expect(shortenStationLabel("闭包")).toBeNull();
    expect(shortenStationLabel("平均变化率")).toBeNull();
  });

  it("drops a trailing parenthetical", () => {
    expect(shortenStationLabel("瞬时变化率（导数的定义）")).toBe("瞬时变化率");
  });

  it("drops a bracketed qualifier", () => {
    expect(shortenStationLabel("函数的单调性【选修部分】")).toBe("函数的单调性");
  });

  it("drops a leading question qualifier so the noun survives", () => {
    // The qualifier alone rarely gets a label under the limit; it earns its keep by making
    // the segment split land on the term rather than on "什么是闭包".
    expect(shortenStationLabel("什么是闭包 · 作用域链 · 变量提升")).toBe("闭包");
  });

  it("leaves a short question label alone rather than stripping for no gain", () => {
    expect(shortenStationLabel("什么是闭包")).toBeNull();
  });

  it("takes the first segment of a compound label", () => {
    expect(shortenStationLabel("闭包 · 作用域链 · 变量提升")).toBe("闭包");
  });

  it("returns null rather than cutting a word in half", () => {
    // Nothing to strip, no separator: truncating this would produce a fragment, and the map
    // ellipsising the real label reads better than a half word.
    expect(shortenStationLabel("函数极限的严格定义与性质")).toBeNull();
  });

  it("handles an empty or whitespace label without throwing", () => {
    expect(shortenStationLabel("")).toBeNull();
    expect(shortenStationLabel("   ")).toBeNull();
  });

  it("measures length in code points, so CJK and latin are treated alike", () => {
    const eleven = "abcdefghijk";
    expect(eleven.length).toBeGreaterThan(RAW_LABEL_SHORT_ENOUGH);
    // No decoration, no separator — declines rather than truncating.
    expect(shortenStationLabel(eleven)).toBeNull();
  });
});
