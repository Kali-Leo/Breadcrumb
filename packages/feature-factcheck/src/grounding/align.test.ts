import { describe, expect, it } from "vitest";
import {
  ALIGN_OVERLAP_THRESHOLD,
  ALIGN_VECTOR_THRESHOLD,
  alignSentences,
  passageSentences,
} from "./align";
import type { TopicPassage } from "./passages";

const PASSAGES: TopicPassage[] = [
  {
    index: 1,
    source: "wikipedia",
    title: "珠穆朗玛峰",
    url: "https://example.org/1",
    text: "珠穆朗玛峰的高度为 8848.86 米。测量使用了全球导航卫星系统。",
  },
  {
    index: 2,
    source: "wikidata",
    title: "珠穆朗玛峰",
    url: "https://example.org/2",
    text: "珠穆朗玛峰位于中国与尼泊尔边界。",
  },
];

function unit(values: readonly number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return values.map((value) => value / norm);
}

describe("passageSentences", () => {
  it("keeps each sentence attached to the passage number the reader sees", () => {
    const sentences = passageSentences(PASSAGES);
    expect(sentences).toHaveLength(3);
    expect(sentences[0]?.passageIndex).toBe(1);
    expect(sentences[2]?.passageIndex).toBe(2);
  });
});

describe("alignSentences", () => {
  const sources = passageSentences(PASSAGES);

  it("matches a near-verbatim sentence with no vectors at all", () => {
    const [match] = alignSentences({
      answerSentences: ["珠穆朗玛峰的高度为 8848.86 米。"],
      sourceSentences: sources,
      answerVectors: null,
      sourceVectors: null,
    });
    expect(match?.sentence.passageIndex).toBe(1);
    expect(match?.literalScore).toBeGreaterThanOrEqual(ALIGN_OVERLAP_THRESHOLD);
  });

  it("matches a source sentence that restates the reply at greater length", () => {
    // The failure this gate was rewritten for: a reply's clause inside an encyclopaedia
    // sentence shares every token it has, and symmetric Jaccard still scores it near 0.3.
    const [match] = alignSentences({
      answerSentences: ["珠穆朗玛峰的高度为 8848.86 米。"],
      sourceSentences: passageSentences([
        {
          index: 1,
          source: "wikipedia",
          title: "珠穆朗玛峰",
          url: "https://example.org/1",
          text: "根据中国与尼泊尔在 2020 年的联合测量，珠穆朗玛峰的高度为 8848.86 米，这一数字为雪面高程。",
        },
      ]),
      answerVectors: null,
      sourceVectors: null,
    });
    expect(match?.sentence.passageIndex).toBe(1);
  });

  it("gives a sentence too short to be distinctive no literal match", () => {
    const [match] = alignSentences({
      answerSentences: ["一次讲一步。"],
      sourceSentences: sources,
      answerVectors: null,
      sourceVectors: null,
    });
    expect(match).toBeNull();
  });

  it("leaves a sentence the sources never mention unmatched", () => {
    const [match] = alignSentences({
      answerSentences: ["气压计测高的原理是空气越高越稀薄。"],
      sourceSentences: sources,
      answerVectors: null,
      sourceVectors: null,
    });
    expect(match).toBeNull();
  });

  it("matches a paraphrase through the vector gate that the literal gate misses", () => {
    const answerVectors = [unit([1, 0, 0])];
    const sourceVectors = sources.map((_source, index) =>
      index === 2 ? unit([1, 0.05, 0]) : unit([0, 1, 0]),
    );
    const [match] = alignSentences({
      answerSentences: ["它横跨两个国家的国境线。"],
      sourceSentences: sources,
      answerVectors,
      sourceVectors,
    });
    expect(match?.sentence.passageIndex).toBe(2);
    expect(match?.vectorScore).toBeGreaterThan(ALIGN_VECTOR_THRESHOLD);
  });

  it("prefers the candidate that cleared its own gate by the wider margin", () => {
    const answerVectors = [unit([1, 0, 0])];
    const sourceVectors = sources.map((_source, index) =>
      index === 1 ? unit([1, 0, 0]) : unit([1, 0.5, 0]),
    );
    const [match] = alignSentences({
      answerSentences: ["测量使用了全球导航卫星系统。"],
      sourceSentences: sources,
      answerVectors,
      sourceVectors,
    });
    expect(match?.sentence.text).toContain("全球导航卫星系统");
  });
});

describe("the measurement route", () => {
  const sources = passageSentences([
    {
      index: 1,
      source: "wikipedia",
      title: "珠穆朗玛峰",
      url: "https://example.org/1",
      text: "2020年12月8日，中国与尼泊尔联合宣布该峰雪面高程为8848.86米。此前的数字是1975年测定的。",
    },
  ]);

  it("marries a rewritten sentence to the source stating the same decimal", () => {
    // Neither similarity gate reaches this pair: the wording shares few tokens and there are
    // no vectors here. The figure itself is what identifies the claim.
    const [match] = alignSentences({
      answerSentences: ["珠峰现在采用的高度是 8848.86 米，这是雪面高程。"],
      sourceSentences: sources,
      answerVectors: null,
      sourceVectors: null,
    });
    expect(match?.measurementMatch).toBe(true);
    expect(match?.sentence.passageIndex).toBe(1);
  });

  it("does not marry two sentences that merely share a year", () => {
    const [match] = alignSentences({
      answerSentences: ["1975 年还发生了很多别的事情，跟高程无关。"],
      sourceSentences: sources,
      answerVectors: null,
      sourceVectors: null,
    });
    expect(match).toBeNull();
  });

  it("prefers the measurement match over a merely similar sentence", () => {
    const twoPassages = passageSentences([
      {
        index: 1,
        source: "a",
        title: "a",
        url: "https://example.org/a",
        text: "珠峰现在采用的高度是雪面高程。",
      },
      {
        index: 2,
        source: "b",
        title: "b",
        url: "https://example.org/b",
        text: "该峰雪面高程为 8848.86 米。",
      },
    ]);
    const [match] = alignSentences({
      answerSentences: ["珠峰现在采用的高度是 8848.86 米，这是雪面高程。"],
      sourceSentences: twoPassages,
      answerVectors: null,
      sourceVectors: null,
    });
    expect(match?.sentence.passageIndex).toBe(2);
  });
});
