/**
 * Purpose: unit tests for the pressure-lexicon loader and scanner — including the bad-data
 * self-check (a string containing a lexicon phrase must be caught).
 */
import { describe, expect, it } from "vitest";
import { findPressureLexiconHits, loadPressureLexicon } from "./pressureLexicon";

describe("loadPressureLexicon", () => {
  it("loads the real data/pressure-lexicon.json with the documented entries", () => {
    const lexicon = loadPressureLexicon();
    expect(lexicon).toContain("你还差");
    expect(lexicon).toContain("落后");
    expect(lexicon.length).toBeGreaterThanOrEqual(7);
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
});
