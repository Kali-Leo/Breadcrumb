/**
 * Purpose: the fold has to preserve the instructions exactly and only move them, otherwise a
 * compatibility measurement stops being a measurement of the same prompt.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import { describe, expect, it } from "vitest";
import { foldSystemMessagesFirst } from "./messagePrep";

describe("foldSystemMessagesFirst", () => {
  it("merges a trailing directive into the leading system message", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "contract" },
      { role: "user", content: "question" },
      { role: "system", content: "language" },
    ];
    expect(foldSystemMessagesFirst(messages)).toEqual([
      { role: "system", content: "contract\n\nlanguage" },
      { role: "user", content: "question" },
    ]);
  });

  it("keeps the conversation's own order", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
      { role: "user", content: "three" },
      { role: "system", content: "language" },
    ];
    expect(foldSystemMessagesFirst(messages).map((message) => message.content)).toEqual([
      "language",
      "one",
      "two",
      "three",
    ]);
  });

  it("leaves a list with no system message alone", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "one" }];
    expect(foldSystemMessagesFirst(messages)).toEqual(messages);
  });
});
