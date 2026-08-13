/**
 * Purpose: pins the reunion title marker round-trip and the retrieval-first instruction —
 * a reunion session must never open with a re-lecture.
 */
import { describe, expect, it } from "vitest";
import { buildReunionSystemLine, isReunionTitle, reunionTopicFromTitle } from "./reunion";

describe("reunion helpers", () => {
  it("recognizes the title marker and extracts the topic", () => {
    expect(isReunionTitle("重逢:闭包")).toBe(true);
    expect(reunionTopicFromTitle("重逢:闭包")).toBe("闭包");
  });

  it("leaves ordinary titles alone", () => {
    expect(isReunionTitle("闭包是什么")).toBe(false);
    expect(reunionTopicFromTitle("闭包是什么")).toBe("闭包是什么");
  });

  it("system line asks for retrieval before telling", () => {
    const line = buildReunionSystemLine("闭包");
    expect(line).toContain("「闭包」");
    expect(line).toContain("检索式问题");
    expect(line).toContain("而不是直接重讲");
  });
});
