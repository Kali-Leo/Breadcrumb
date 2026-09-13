/**
 * Purpose: the three tokenizer failures measured on 76 million real passages, each pinned so
 * it cannot come back silently. Hindi shredded into bare consonants cost BM25 0.231 of
 * nDCG@10; the same fix applied to only one side of the index cost Bengali *everything*
 * (0.0000); missing stems cost Russian 0.088. None of the three announces itself — the index
 * builds, the query runs, and the answers are just wrong — so these are the alarm.
 */
import { describe, expect, it } from "vitest";
import { analyze, analyzedFields, fold, matchExpression, stemLanguageFor } from "./analyzer";
import { loadStemmer } from "./stemmers";
import { ftsTokenChars, tokenPattern } from "./tokenChars";

describe("Chinese", () => {
  it("indexes overlapping character bigrams, not words", () => {
    expect(analyze("北京大学").tokens).toEqual(["北京", "京大", "大学"]);
  });

  it("lets a lone character stand as itself", () => {
    expect(analyze("我 A").tokens).toEqual(["我", "a"]);
  });

  it("splits a mixed run so both halves stay reachable", () => {
    expect(analyze("北京2024").tokens).toEqual(["北京", "2024"]);
  });

  it("finds a phrase that occurs inside a longer run", () => {
    const document = new Set(analyze("清华大学计算机系").tokens);
    for (const term of analyze("大学").tokens) expect(document.has(term)).toBe(true);
  });
});

describe("Devanagari and Bengali", () => {
  const hindi = "देश में निर्मित";
  const bengali = "বাংলাদেশের রাজধানী";

  it("keeps a Hindi word whole instead of shredding it into consonants", () => {
    const tokens = analyze(hindi).tokens;
    expect(tokens).toEqual(["देश", "में", "निर्मित"]);
    // The failure mode this replaces: every token one bare consonant.
    expect(tokens.every((token) => [...token].length > 1)).toBe(true);
  });

  it("keeps a Bengali word whole", () => {
    expect(analyze(bengali).tokens).toEqual(["বাংলাদেশের", "রাজধানী"]);
  });

  it("gives SQLite the same marks the query side keeps, so both cut in the same places", () => {
    // Every character the pattern accepts and unicode61 would not must be in tokenchars,
    // or the index re-splits exactly the words this file just kept whole.
    const declared = new Set([...ftsTokenChars()]);
    const letters = /\p{L}|\p{N}/u;
    for (const token of [...analyze(hindi).tokens, ...analyze(bengali).tokens]) {
      for (const character of token) {
        if (letters.test(character)) continue;
        expect(declared.has(character)).toBe(true);
      }
    }
  });

  it("does not swallow whitespace or punctuation into a token", () => {
    expect("क, ख".match(tokenPattern())).toEqual(["क", "ख"]);
  });
});

describe("stemming", () => {
  it("picks the algorithm from the script where the script settles it", () => {
    expect(stemLanguageFor("чаво", "en")).toBe("russian");
    expect(stemLanguageFor("الكتاب", "en")).toBe("arabic");
    expect(stemLanguageFor("देश", "en")).toBe(null);
  });

  it("picks it from the document's language where the script cannot", () => {
    expect(stemLanguageFor("running", "en")).toBe("english");
    expect(stemLanguageFor("corriendo", "es")).toBe("spanish");
    expect(stemLanguageFor("berlari", "id")).toBe(null);
    expect(stemLanguageFor("running", undefined)).toBe(null);
  });

  it("reduces real inflections in the languages the measurement covered", async () => {
    const stem = await loadStemmer();
    expect(stem("чаво", "russian")).toBe("чав");
    expect(stem("running", "english")).toBe("run");
    expect(stem("corriendo", "spanish")).toBe("corr");
  });

  it("writes a stem only where it differs, so an unchanged word is not counted twice", async () => {
    const stem = await loadStemmer();
    const analyzed = analyze("running run", { language: "en", stem });
    expect(analyzed.tokens).toEqual(["running", "run"]);
    expect(analyzed.stems).toEqual(["run"]);
  });

  it("leaves the shadow field empty when no stemmer was supplied", () => {
    expect(analyze("running", { language: "en" }).stems).toEqual([]);
  });
});

describe("index and query agree", () => {
  it("puts the same terms in the row and in the MATCH expression", async () => {
    const stem = await loadStemmer();
    const options = { language: "ru", stem };
    const row = analyzedFields(analyze("Москва является столицей", options));
    const expression = matchExpression(analyze("столицей", options));
    expect(expression).toContain('"столицей"');
    expect(row.body.split(" ")).toContain("столицей");
    // And the stem reaches the shadow field, which is what makes "столица" find this row.
    expect(row.stems.split(" ")).toContain(stem("столицей", "russian"));
  });

  it("quotes every term so a word that looks like syntax stays a word", () => {
    expect(matchExpression(analyze("AND or NOT"))).toBe('"and" OR "or" OR "not"');
  });

  it("has nothing to match when the question held no indexable characters", () => {
    expect(matchExpression(analyze("？！ …"))).toBe("");
  });

  it("normalizes so a decomposed word and a precomposed one are the same word", () => {
    expect(analyze("café").tokens).toEqual(analyze("café").tokens);
  });
});

describe("folding", () => {
  it("finds an accented word whether or not the question typed the accent", () => {
    // Both sides fold, so this is one term with one document frequency. Folded on one side
    // only — which is what SQLite's own remove_diacritics would give us — the accented
    // spelling is a term the index has never seen, and 69 of 100 sampled French questions had
    // at least one term in exactly that state.
    expect(analyze("caf\u00e9").tokens).toEqual(["cafe"]);
    expect(matchExpression(analyze("Caf\u00e9"))).toBe(matchExpression(analyze("cafe")));
    expect(matchExpression(analyze("\u00e9l\u00e8ve fran\u00e7ais"))).toBe('"eleve" OR "francais"');
  });

  it("does not fold the marks that ARE the letters of a script", () => {
    expect(analyze("\u0928\u093f\u0930\u094d\u092e\u093f\u0924").tokens).toEqual([
      "\u0928\u093f\u0930\u094d\u092e\u093f\u0924",
    ]);
    // Cyrillic и and й are two letters, and compatibility decomposition writes the second as
    // the first plus a mark out of the very block Latin accents come from. Stripping by block
    // alone silently merges them.
    expect(analyze("\u0441\u0442\u043e\u043b\u0438\u0446\u0435\u0439").tokens).toEqual([
      "\u0441\u0442\u043e\u043b\u0438\u0446\u0435\u0439",
    ]);
    expect(fold("\u0451\u0436")).toBe("\u0451\u0436");
  });

  it("reads the characters a PDF substitutes as the characters they stand for", () => {
    // Text extracted from a PDF typeset in a CJK font comes back with Kangxi radicals where
    // ordinary characters were written. Those are symbols, not letters, so an unfolded
    // tokenizer stops dead at each one and leaves a hole in the middle of every word: the
    // book's own title indexed as three fragments on a real 40,000-character import.
    expect(analyze("\u2f45\u5411").tokens).toEqual(analyze("\u65b9\u5411").tokens);
    expect(analyze("\u4e2d\u2f42\u6d4b\u8bd5\u2f42\u96c6").tokens).toEqual(
      analyze("\u4e2d\u6587\u6d4b\u8bd5\u6587\u96c6").tokens,
    );
    expect(analyze("\uff21\uff22").tokens).toEqual(["ab"]);
  });
});
