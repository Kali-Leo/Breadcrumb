/**
 * Purpose: unit tests for the teaching-discipline tripwire — question-mark counting (including
 * the consecutive-marks-collapse-to-one rule) and the reply-length gate's exact boundary.
 */
import { describe, expect, it } from "vitest";
import { checkTeachingDiscipline, countQuestions } from "./teachingDiscipline";

describe("countQuestions", () => {
  it("is zero for text with no question mark", () => {
    expect(countQuestions("闭包会捕获外层变量。")).toBe(0);
  });

  it("counts a single question mark", () => {
    expect(countQuestions("这是什么？")).toBe(1);
  });

  it("counts multiple non-adjacent question marks separately", () => {
    expect(countQuestions("你在吗？知道答案吗？")).toBe(2);
  });

  it("collapses a run of consecutive question marks into one", () => {
    expect(countQuestions("你确定吗？？")).toBe(1);
  });

  it("counts mixed Chinese/English question marks, adjacent ones as one", () => {
    expect(countQuestions("Are you there? 你在吗？")).toBe(2);
    expect(countQuestions("真的吗？?")).toBe(1);
  });
});

describe("checkTeachingDiscipline", () => {
  it("returns all-zero counts for an empty array", () => {
    expect(checkTeachingDiscipline([])).toEqual({
      totalReplies: 0,
      multiQuestionReplies: 0,
      overlongReplies: 0,
    });
  });

  it("does not flag a reply with zero or one question mark", () => {
    const result = checkTeachingDiscipline(["先讲结论。", "这是什么？"]);
    expect(result.totalReplies).toBe(2);
    expect(result.multiQuestionReplies).toBe(0);
  });

  it("flags a reply with more than one question segment", () => {
    const result = checkTeachingDiscipline(["这是什么？还有别的吗？"]);
    expect(result.multiQuestionReplies).toBe(1);
  });

  it("does not flag a reply whose consecutive question marks collapse to one segment", () => {
    const result = checkTeachingDiscipline(["你确定吗？？"]);
    expect(result.multiQuestionReplies).toBe(0);
  });

  it("does not flag a reply exactly at the 1200-char default boundary", () => {
    const reply = "a".repeat(1200);
    const result = checkTeachingDiscipline([reply]);
    expect(result.overlongReplies).toBe(0);
  });

  it("flags a reply one character past the 1200-char default boundary", () => {
    const reply = "a".repeat(1201);
    const result = checkTeachingDiscipline([reply]);
    expect(result.overlongReplies).toBe(1);
  });

  it("honors a custom maxChars option", () => {
    const result = checkTeachingDiscipline(["12345"], { maxChars: 4 });
    expect(result.overlongReplies).toBe(1);
    expect(checkTeachingDiscipline(["1234"], { maxChars: 4 }).overlongReplies).toBe(0);
  });

  it("counts multi-question and overlong independently in a mixed batch", () => {
    const shortOk = "结论先行。";
    const multi = "这是什么？为什么？";
    const overlong = "b".repeat(1201);
    const result = checkTeachingDiscipline([shortOk, multi, overlong]);
    expect(result.totalReplies).toBe(3);
    expect(result.multiQuestionReplies).toBe(1);
    expect(result.overlongReplies).toBe(1);
  });
});
