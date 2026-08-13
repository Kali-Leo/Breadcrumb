/**
 * Purpose: locks the teaching contract's load-bearing clauses and the mode addenda —
 * a wording rewrite that drops a discipline should fail here, not in production.
 */
import { describe, expect, it } from "vitest";
import { buildTeachingSystemPrompt, TEACHING_CONTRACT_BASE } from "./contract";

describe("buildTeachingSystemPrompt", () => {
  it("adaptive mode is exactly the base contract", () => {
    expect(buildTeachingSystemPrompt("adaptive")).toBe(TEACHING_CONTRACT_BASE);
  });

  it("base contract keeps every load-bearing discipline", () => {
    const base = TEACHING_CONTRACT_BASE;
    expect(base).toContain("不评判也不夸赞");
    expect(base).toContain("第一句就给出答案"); // fact questions: answer first
    expect(base).toContain("一次最多问一个问题");
    expect(base).toContain("一次回复只推进一步");
    expect(base).toContain("不直接给完整答案"); // practice-time hint ladder
    expect(base).toContain("明显受挫"); // frustration exit
    expect(base).toContain("先指出答对的部分"); // indirect correction
    expect(base).toContain("由对方决定是否继续"); // never-complete closing hook
  });

  it("direct mode appends the tell-override after the base", () => {
    const prompt = buildTeachingSystemPrompt("direct");
    expect(prompt.startsWith(TEACHING_CONTRACT_BASE)).toBe(true);
    expect(prompt).toContain("直给模式");
    expect(prompt).toContain("自查小问题"); // sense-making hook survives direct mode
  });

  it("guided mode appends the ladder-override and keeps the frustration exit", () => {
    const prompt = buildTeachingSystemPrompt("guided");
    expect(prompt.startsWith(TEACHING_CONTRACT_BASE)).toBe(true);
    expect(prompt).toContain("引导模式");
    expect(prompt).toContain("不再继续引导");
  });

  it("contract stays free of pressure and praise wording", () => {
    for (const banned of ["你还差", "落后", "别忘了", "应该早点", "再不", "真棒", "很棒", "太棒"]) {
      expect(TEACHING_CONTRACT_BASE).not.toContain(banned);
    }
  });
});
