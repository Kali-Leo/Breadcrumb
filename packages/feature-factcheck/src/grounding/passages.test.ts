import { describe, expect, it } from "vitest";
import type { EvidenceItem } from "../evidence/provider";
import {
  buildTopicPassages,
  formatPassageBlock,
  orderForAttention,
  TOPIC_PASSAGE_COUNT,
} from "./passages";

function item(index: number, snippet = `段落${index}`): EvidenceItem {
  return {
    url: `https://example.org/${index}`,
    title: `标题${index}`,
    snippet,
    source: `source-${index}`,
  };
}

describe("orderForAttention", () => {
  it("opens with the best and closes with the second best", () => {
    expect(orderForAttention([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([1, 3, 5, 7, 8, 6, 4, 2]);
  });

  it("leaves a list with no middle alone", () => {
    expect(orderForAttention([])).toEqual([]);
    expect(orderForAttention(["a"])).toEqual(["a"]);
    expect(orderForAttention(["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("buildTopicPassages", () => {
  it("numbers passages by display order, not by relevance rank", () => {
    const passages = buildTopicPassages([item(1), item(2), item(3)]);
    expect(passages.map((passage) => passage.index)).toEqual([1, 2, 3]);
    expect(passages.map((passage) => passage.text)).toEqual(["段落1", "段落3", "段落2"]);
  });

  it("caps at eight, the depth the retrieval measurements report", () => {
    const many = Array.from({ length: 20 }, (_, index) => item(index));
    expect(buildTopicPassages(many)).toHaveLength(TOPIC_PASSAGE_COUNT);
  });

  it("drops empty snippets and repeated urls", () => {
    const duplicate = { ...item(1), title: "另一个标题" };
    const passages = buildTopicPassages([item(1), duplicate, item(2, "   ")]);
    expect(passages).toHaveLength(1);
  });
});

describe("formatPassageBlock", () => {
  it("writes one numbered line per passage with its source name", () => {
    const block = formatPassageBlock(buildTopicPassages([item(1), item(2)]));
    expect(block).toContain("[1] source-1 · 段落1");
    expect(block).toContain("[2] source-2 · 段落2");
  });
});
