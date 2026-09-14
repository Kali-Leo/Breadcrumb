/**
 * Purpose: a quote is named by its source's catalogue name, and a quote from the reader's own
 * library by its book and chapter as well — a name alone could be any of their books.
 */
import { describe, expect, it } from "vitest";
import { groundingSourceHeading, groundingSourceLabel } from "./sourceLabel";

const catalogue: Record<string, string> = {
  "grounding.sources.wikipedia": "维基百科",
  "grounding.sources.library": "我的资料",
};
const t = ((key: string) => catalogue[key] ?? key) as unknown as (key: never) => string;

describe("groundingSourceLabel", () => {
  it("names a catalogued source and leaves an unknown id as it stands", () => {
    expect(groundingSourceLabel(t, "wikipedia")).toBe("维基百科");
    expect(groundingSourceLabel(t, "somewhere")).toBe("somewhere");
  });
});

describe("groundingSourceHeading", () => {
  it("adds the heading path after the name for a library passage", () => {
    expect(
      groundingSourceHeading(t, { source: "library", title: "《测量史》 → 第一章 → 高度基准" }),
    ).toBe("我的资料 · 《测量史》 → 第一章 → 高度基准");
  });

  it("names a web source by its catalogue name alone", () => {
    expect(groundingSourceHeading(t, { source: "wikipedia", title: "珠穆朗玛峰" })).toBe(
      "维基百科",
    );
  });

  it("never prints a dangling separator for a passage with no heading path", () => {
    expect(groundingSourceHeading(t, { source: "library", title: "  " })).toBe("我的资料");
  });
});
