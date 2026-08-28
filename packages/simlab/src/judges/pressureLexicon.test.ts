/**
 * Purpose: unit tests for the pressure-lexicon loader and scanner — including the bad-data
 * self-check (a string containing a lexicon phrase must be caught).
 */
import { describe, expect, it } from "vitest";
import {
  findPressureLexiconHits,
  loadPressureLexicon,
  loadPressureLexicons,
} from "./pressureLexicon";

describe("loadPressureLexicon", () => {
  it("loads the real data/pressure-lexicon.json with the documented entries", () => {
    const lexicon = loadPressureLexicon();
    expect(lexicon).toContain("你还差");
    expect(lexicon).toContain("落后");
    expect(lexicon.length).toBeGreaterThanOrEqual(7);
  });

  it("carries a list per language, so the gate means something outside Chinese", () => {
    const lexicons = loadPressureLexicons();
    expect(Object.keys(lexicons)).toContain("en");
    expect(loadPressureLexicon("en")).toContain("falling behind");
  });

  it("returns nothing for a language that has no list yet, rather than throwing", () => {
    expect(loadPressureLexicon("sw-KE")).toEqual([]);
  });
});

describe("findPressureLexiconHits", () => {
  const lexicon = loadPressureLexicon();

  it("catches a string containing a pressure phrase (self-check)", () => {
    const hits = findPressureLexiconHits("你还差一点就能学会这个概念了", lexicon);
    expect(hits).toContain("你还差");
  });

  it("finds every distinct hit, not just the first", () => {
    const hits = findPressureLexiconHits("你还差很多，而且已经落后了", lexicon);
    expect(hits.sort()).toEqual(["你还差", "落后"].sort());
  });

  it("returns no hits for gentle, zero-pressure text", () => {
    const hits = findPressureLexiconHits("你搞懂了闭包！真棒，继续保持这份好奇心。", lexicon);
    expect(hits).toEqual([]);
  });

  it("catches an English phrase wherever it sits in the sentence", () => {
    const english = loadPressureLexicon("en");
    expect(findPressureLexiconHits("Don't forget the review waiting for you.", english)).toContain(
      "don't forget",
    );
  });
});
