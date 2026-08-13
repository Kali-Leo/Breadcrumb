/**
 * Purpose: pins the confusion heuristic — the downshift must fire on plain "I didn't get
 * it" phrasings and stay quiet on ordinary questions (false positives patronize).
 */
import { describe, expect, it } from "vitest";
import { detectConfusion } from "./confusion";

describe("detectConfusion", () => {
  it.each([
    "这段我没听懂",
    "还是不会做",
    "这是什么意思？",
    "换个说法讲讲吧",
    "太抽象了",
    "越看越糊涂",
    "没明白你说的递归",
    "再讲一遍好吗",
    "我不太理解这里",
    "懵了",
  ])("fires on: %s", (message) => {
    expect(detectConfusion(message)).toBe(true);
  });

  it.each([
    "我懂了，继续吧",
    "这个概念很有意思",
    "帮我看看这段代码",
    "闭包和作用域是什么关系",
    "明白了，那下一步呢",
    "给我讲讲快速排序",
    "",
    "   ",
  ])("stays quiet on: %s", (message) => {
    expect(detectConfusion(message)).toBe(false);
  });
});
