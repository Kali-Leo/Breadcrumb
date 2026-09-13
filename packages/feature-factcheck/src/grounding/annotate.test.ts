import { describe, expect, it } from "vitest";
import { annotateAnswer } from "./annotate";
import type { TopicPassage } from "./passages";

const PASSAGES: TopicPassage[] = [
  {
    index: 1,
    source: "wikipedia",
    title: "珠穆朗玛峰",
    url: "https://example.org/1",
    text: "珠穆朗玛峰的高度为 8848.86 米。",
  },
  {
    index: 2,
    source: "wikidata",
    title: "珠穆朗玛峰",
    url: "https://example.org/2",
    text: "珠穆朗玛峰的高度为 8844.43 米。",
  },
];

const QUESTION = "珠穆朗玛峰有多高";

function annotate(answer: string, passages: readonly TopicPassage[] = PASSAGES) {
  return annotateAnswer({
    answer,
    question: QUESTION,
    passages,
    answerVectors: null,
    sourceVectors: null,
  });
}

describe("annotateAnswer", () => {
  it("labels a sentence taken from a passage 有资料 and carries its source sentence", () => {
    const single = PASSAGES.slice(0, 1);
    const { sentences } = annotate("珠穆朗玛峰的高度为 8848.86 米。", single);
    expect(sentences[0]?.label).toBe("grounded");
    expect(sentences[0]?.quote?.text).toBe("珠穆朗玛峰的高度为 8848.86 米。");
    expect(sentences[0]?.quote?.passageIndex).toBe(1);
  });

  it("labels the model's own explanation 无资料 rather than warning about it", () => {
    const single = PASSAGES.slice(0, 1);
    const { sentences } = annotate(
      "珠穆朗玛峰的高度为 8848.86 米。想象一下把二十座东方明珠叠起来。",
      single,
    );
    expect(sentences.map((sentence) => sentence.label)).toEqual(["grounded", "own"]);
    expect(sentences[1]?.quote).toBeNull();
  });

  it("refuses 有资料 to a sentence carrying a figure no source has", () => {
    const single = PASSAGES.slice(0, 1);
    const { sentences } = annotate("珠穆朗玛峰的高度为 8850.00 米。", single);
    expect(sentences[0]?.label).toBe("own");
    expect(sentences[0]?.ungroundedValues).toEqual(["8850.00米"]);
  });

  it("labels 资料相悖 when two sources give different figures in the same unit", () => {
    const { sentences } = annotate("珠穆朗玛峰的高度为 8848.86 米。");
    expect(sentences[0]?.label).toBe("conflicting");
    expect(sentences[0]?.quote?.source).toBe("wikipedia");
    expect(sentences[0]?.rival?.source).toBe("wikidata");
  });

  it("counts the three labels for the line that summarises them", () => {
    const single = PASSAGES.slice(0, 1);
    const { counts } = annotate(
      "珠穆朗玛峰的高度为 8848.86 米。这个数字是雪面高度，我理解它每年还在变。",
      single,
    );
    expect(counts).toEqual({ grounded: 1, own: 1, conflicting: 0 });
  });

  it("labels everything 无资料 when there are no passages at all", () => {
    const { sentences } = annotate("珠穆朗玛峰的高度为 8848.86 米。", []);
    expect(sentences[0]?.label).toBe("own");
  });
});

describe("sentence identity", () => {
  it("numbers sentences by their place in the answer, so two identical ones stay apart", () => {
    const single = PASSAGES.slice(0, 1);
    const { sentences } = annotate(
      "这个数字的测量方法有很多争议。这个数字的测量方法有很多争议。",
      single,
    );
    expect(sentences.map((sentence) => sentence.order)).toEqual([0, 1]);
  });
});

describe("what counts as a claim", () => {
  const single = PASSAGES.slice(0, 1);

  it("leaves a question put to the learner unmarked — it asserts nothing", () => {
    const { sentences } = annotate(
      "珠穆朗玛峰的高度为 8848.86 米。那岩面高度大概会是多少，比它高还是比它低？",
      single,
    );
    expect(sentences).toHaveLength(1);
    expect(sentences[0]?.label).toBe("grounded");
  });

  it("leaves a heading unmarked rather than tying it to a source", () => {
    const { sentences } = annotate("一、高度基准。珠穆朗玛峰的高度为 8848.86 米。", single);
    expect(sentences.map((sentence) => sentence.text)).toEqual(["珠穆朗玛峰的高度为 8848.86 米。"]);
  });
});

describe("where a mark goes", () => {
  it("carries the offsets of the sentence in the answer it was given", () => {
    const single = PASSAGES.slice(0, 1);
    const answer = "开头一句不算数的话。**珠穆朗玛峰**的高度为 8848.86 米。";
    const { sentences } = annotate(answer, single);
    const marked = sentences.at(-1);
    expect(marked).toBeDefined();
    if (marked === undefined) return;
    // The mark sits just past the sentence's last visible character, in the answer's own
    // coordinates — that is what lets the renderer put a dot there instead of restating it.
    expect(answer[marked.end - 1]).toBe("。");
    expect(answer.slice(marked.start, marked.end)).toContain("8848.86");
  });
});

describe("a figure sentence is always a claim", () => {
  it("keeps the answer's most checkable sentence, short as it is", () => {
    const single = PASSAGES.slice(0, 1);
    // 「**8848.86 米**（雪面高程）。」 was being dropped as "not a claim" because the content
    // count filtered the segmenter's own bigrams — the one sentence the sources can confirm.
    const { sentences } = annotate("**8848.86 米**（雪面高程）。", single);
    expect(sentences).toHaveLength(1);
    expect(sentences[0]?.label).toBe("grounded");
  });
});
