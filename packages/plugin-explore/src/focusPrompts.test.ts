/**
 * Purpose: tests for focus-session prompt assembly — the word-node's parent-answer+word
 * shape, and the question-node's ordered ancestor-chain shape (spec 042 §2).
 */
import { describe, expect, it } from "vitest";
import {
  buildQuestionMessages,
  buildWordExplainMessages,
  FOCUS_SYSTEM_PROMPT,
} from "./focusPrompts";

describe("buildWordExplainMessages", () => {
  it("quotes the parent answer in full and asks about the picked word", () => {
    const messages = buildWordExplainMessages("闭包是函数与其词法环境的绑定。", "词法环境");
    expect(messages[0]).toEqual({ role: "system", content: FOCUS_SYSTEM_PROMPT });
    expect(messages[1]?.role).toBe("user");
    expect(messages[1]?.content).toContain("闭包是函数与其词法环境的绑定。");
    expect(messages[1]?.content).toContain("「词法环境」");
    expect(messages[1]?.content).toBe(
      "下面这段讲解里出现了「词法环境」：\n\n闭包是函数与其词法环境的绑定。\n\n请解释「词法环境」在这里的含义。",
    );
  });

  it("degrades to a plain explanation when there is no parent context (map 继续, reopened retry)", () => {
    for (const emptyContext of ["", "   \n"]) {
      const messages = buildWordExplainMessages(emptyContext, "词法环境");
      expect(messages[1]?.content).toBe("请讲解「词法环境」。");
      // The refusal trigger: quoting an explanation that is not there.
      expect(messages[1]?.content).not.toContain("这段讲解");
    }
  });
});

describe("buildQuestionMessages", () => {
  it("concatenates ancestor answers root-to-parent in order before the question", () => {
    const messages = buildQuestionMessages(
      [
        { label: "闭包", answerText: "闭包是函数与其词法环境的绑定。" },
        { label: "词法环境", answerText: "词法环境是变量在代码中声明的位置决定的作用域。" },
      ],
      "为什么闭包容易导致内存泄漏？",
    );
    expect(messages[0]).toEqual({ role: "system", content: FOCUS_SYSTEM_PROMPT });
    expect(messages[1]?.content).toBe(
      "### 闭包\n闭包是函数与其词法环境的绑定。\n\n### 词法环境\n词法环境是变量在代码中声明的位置决定的作用域。\n\n为什么闭包容易导致内存泄漏？",
    );
  });

  it("handles a single root ancestor", () => {
    const messages = buildQuestionMessages(
      [{ label: "闭包", answerText: "闭包是函数与其词法环境的绑定。" }],
      "举个例子？",
    );
    expect(messages[1]?.content).toBe("### 闭包\n闭包是函数与其词法环境的绑定。\n\n举个例子？");
  });
});
