/**
 * Purpose: locks the teaching contract's load-bearing clauses — a wording rewrite that
 * drops a discipline should fail here, not in production.
 */
import { describe, expect, it } from "vitest";
import { buildTeachingSystemPrompt, TEACHING_CONTRACT_BASE } from "./contract";

describe("buildTeachingSystemPrompt", () => {
  it("is exactly the base contract", () => {
    expect(buildTeachingSystemPrompt()).toBe(TEACHING_CONTRACT_BASE);
  });

  it("base contract keeps every load-bearing discipline", () => {
    const base = TEACHING_CONTRACT_BASE;
    expect(base).toContain("不评判也不夸赞");
    expect(base).toContain("第一句就给出答案"); // fact questions: answer first
    expect(base).toContain("一次最多问一个问题");
    expect(base).toContain("一次回复只推进一步");
    expect(base).toContain("先给线索和用法提示"); // practice-time hint ladder
    expect(base).toContain("明显受挫"); // frustration exit
    expect(base).toContain("先指出答对的部分"); // indirect correction
    expect(base).toContain("由对方决定是否继续"); // never-complete closing hook
  });

  it("honors an explicit direct request immediately", () => {
    expect(TEACHING_CONTRACT_BASE).toContain("提出要直接讲时，立刻完整讲清");
    expect(TEACHING_CONTRACT_BASE).toContain("不追问、不拖延");
    expect(TEACHING_CONTRACT_BASE).not.toContain("再次要求");
  });

  it("contract stays free of pressure and praise wording", () => {
    for (const banned of ["你还差", "落后", "别忘了", "应该早点", "再不", "真棒", "很棒", "太棒"]) {
      expect(TEACHING_CONTRACT_BASE).not.toContain(banned);
    }
  });
});
