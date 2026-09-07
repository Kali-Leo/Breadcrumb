import { describe, expect, it } from "vitest";
import { countsL2Norm, hashedNgramCounts, murmurHash3 } from "./hashing";
import { TOPIC_DIMENSIONS } from "./topicModel";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * The oracle is scikit-learn, not the JavaScript reference: the weights were fitted through
 * `HashingVectorizer`, so agreeing with sklearn is what actually makes the weights apply.
 * Produced with, and reproducible by:
 *   python3 -c "from sklearn.utils import murmurhash3_32; \
 *     print([murmurhash3_32(t.encode('utf-8'), seed=0, positive=False) for t in TOKENS])"
 * The tokens are the ones that break naive ports: a 1-byte body (tail block only), 2 and 3
 * bytes, multi-byte CJK, ASCII words, the U+0001 separator the classifier input carries, an
 * astral character (where UTF-16 and code-point iteration disagree), and a 7-byte string that
 * exercises a full 4-byte body plus a 3-byte tail.
 */
const SKLEARN_HASHES: ReadonlyArray<readonly [string, number]> = [
  ["a", 1009084850],
  ["ab", -1681926305],
  ["深", -915183637],
  ["深度", -860567303],
  ["度学", -1541828605],
  ["Rust", 1328865862],
  [" \u0001 ", 1280034004],
  ["猫🐱", 1927525593],
  ["xxxxxxx", 973454475],
];

describe("murmurHash3", () => {
  it("matches sklearn's murmurhash3_32(seed=0, positive=False)", () => {
    for (const [token, expected] of SKLEARN_HASHES) expect(murmurHash3(utf8(token))).toBe(expected);
  });

  it("returns a signed 32-bit integer for the empty input", () => {
    expect(murmurHash3(utf8(""))).toBe(0);
  });
});

describe("hashedNgramCounts", () => {
  it("counts 1..3-grams by code point, so an astral character is one character", () => {
    // "a🐱b" is 3 code points: 3 unigrams + 2 bigrams + 1 trigram = 6 grams.
    const counts = hashedNgramCounts("a🐱b", TOPIC_DIMENSIONS);
    let total = 0;
    for (const value of counts.values()) total += value;
    expect(total).toBe(6);
  });

  it("keeps insertion order — n ascending, then position", () => {
    const counts = hashedNgramCounts("abc", TOPIC_DIMENSIONS);
    const keys = [...counts.keys()];
    expect(keys[0]).toBe(hashOf("a"));
    expect(keys[1]).toBe(hashOf("b"));
    expect(keys[2]).toBe(hashOf("c"));
    expect(keys[3]).toBe(hashOf("ab"));
  });

  it("gives an empty string no grams, and normalises it by 1 rather than 0", () => {
    const counts = hashedNgramCounts("", TOPIC_DIMENSIONS);
    expect(counts.size).toBe(0);
    expect(countsL2Norm(counts)).toBe(1);
  });

  it("normalises by the L2 norm of the counts", () => {
    // "aa": unigram "a" twice, bigram "aa" once → sqrt(4 + 1).
    expect(countsL2Norm(hashedNgramCounts("aa", TOPIC_DIMENSIONS))).toBe(Math.sqrt(5));
  });
});

const hashOf = (gram: string): number => Math.abs(murmurHash3(utf8(gram))) % TOPIC_DIMENSIONS;
