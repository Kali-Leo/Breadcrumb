/**
 * Purpose: unit tests for buildArticleMessages' prompt content.
 */
import { describe, expect, it } from "vitest";
import { buildArticleMessages } from "./articlePrompts";

describe("buildArticleMessages", () => {
  it("returns a system + user message pair", () => {
    const messages = buildArticleMessages({
      title: "闭包是什么",
      hook: "函数记住了出生时的作用域。",
      topicLabel: "编程语言",
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("user");
  });

  it("echoes the card's title, hook and topic into the user message", () => {
    const messages = buildArticleMessages({
      title: "闭包是什么",
      hook: "函数记住了出生时的作用域。",
      topicLabel: "编程语言",
    });
    const userContent = messages[1]?.content ?? "";
    expect(userContent).toContain("闭包是什么");
    expect(userContent).toContain("函数记住了出生时的作用域。");
    expect(userContent).toContain("编程语言");
  });

  it("asks for Markdown, a word-count range and no praise words in the system prompt", () => {
    const systemContent =
      buildArticleMessages({ title: "t", hook: "h", topicLabel: "p" })[0]?.content ?? "";
    expect(systemContent).toContain("Markdown");
    expect(systemContent).toContain("600-900");
    expect(systemContent).toContain("不使用夸赞词");
  });

  it("asks for a closing sentence toward a next question without call-to-action pressure", () => {
    const systemContent =
      buildArticleMessages({ title: "t", hook: "h", topicLabel: "p" })[0]?.content ?? "";
    expect(systemContent).toContain("下一个问题");
  });
});
