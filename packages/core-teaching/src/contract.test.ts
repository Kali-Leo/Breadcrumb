/**
 * Purpose: locks the teaching contract's load-bearing clauses — a wording rewrite that
 * drops a discipline should fail here, not in production.
 */
import { describe, expect, it } from "vitest";
import {
  buildFreeChatSystemPrompt,
  buildTeachingSystemPrompt,
  FREE_CHAT_BASE,
  GROUNDED_TEACHING_CLAUSE,
  TEACHING_CONTRACT_BASE,
} from "./contract";

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

  it("names the four situations that must be flagged as unsure", () => {
    for (const trigger of [
      "记不确切", // a figure, date, name or number the model does not hold precisely
      "不一致的说法", // sources may disagree
      "超出你可靠的知识范围",
      "随时间变化", // time-sensitive facts
    ]) {
      expect(TEACHING_CONTRACT_BASE).toContain(trigger);
    }
  });

  it("gives a checkable test for low confidence, not an introspection", () => {
    expect(TEACHING_CONTRACT_BASE).toContain("说不出它出自哪里");
  });

  it("demands the half that makes a hedge useful", () => {
    expect(TEACHING_CONTRACT_BASE).toContain("什么能定这件事");
    expect(TEACHING_CONTRACT_BASE).toContain("宁可说不知道");
  });

  it("keeps the opposite duty — a settled answer is still given outright", () => {
    expect(TEACHING_CONTRACT_BASE).toContain("第一句就给出答案");
    expect(TEACHING_CONTRACT_BASE).toContain("不加免责声明");
    // Scoped honesty: the uncertain part is marked, the rest is still taught.
    expect(TEACHING_CONTRACT_BASE).toContain("只标出没把握的那一部分");
  });

  it("contract stays free of pressure and praise wording", () => {
    for (const banned of ["你还差", "落后", "别忘了", "应该早点", "再不", "真棒", "很棒", "太棒"]) {
      expect(TEACHING_CONTRACT_BASE).not.toContain(banned);
    }
  });
});

describe("both contracts", () => {
  it("name no output language — that is core-i18n's directive, not the contract's", () => {
    for (const base of [TEACHING_CONTRACT_BASE, FREE_CHAT_BASE]) {
      for (const named of ["中文", "英文", "English", "用中文", "母语"]) {
        expect(base).not.toContain(named);
      }
    }
  });
});

describe("the grounding clause", () => {
  it("is absent from an ordinary round and appended to a grounded one", () => {
    expect(buildTeachingSystemPrompt()).toBe(TEACHING_CONTRACT_BASE);
    expect(buildTeachingSystemPrompt({ grounded: false })).toBe(TEACHING_CONTRACT_BASE);
    expect(buildTeachingSystemPrompt({ grounded: true })).toBe(
      TEACHING_CONTRACT_BASE + GROUNDED_TEACHING_CLAUSE,
    );
  });

  it("says three things, all of them things to do", () => {
    const bullets = GROUNDED_TEACHING_CLAUSE.split("\n").filter((line) => line.startsWith("- "));
    expect(bullets).toHaveLength(3);
    // The measured failure mode is a constraint list: every added prohibition costs the model
    // accuracy on constraints it was already meeting, so this clause must never grow one.
    for (const banned of ["不许", "不要", "禁止", "不能", "不得"]) {
      expect(GROUNDED_TEACHING_CLAUSE).not.toContain(banned);
    }
  });

  it("never asks the model to write citation numbers — the code aligns them afterwards", () => {
    for (const banned of ["编号", "标注", "[1]", "序号", "引用"]) {
      expect(GROUNDED_TEACHING_CLAUSE).not.toContain(banned);
    }
  });

  it("leaves the abstention clause standing rather than restating it", () => {
    expect(buildTeachingSystemPrompt({ grounded: true })).toContain("宁可说不知道");
    expect(GROUNDED_TEACHING_CLAUSE).not.toContain("宁可说不知道");
  });

  it("does not touch the free-chat contract", () => {
    expect(buildFreeChatSystemPrompt()).not.toContain("对着资料讲");
  });
});

describe("buildFreeChatSystemPrompt", () => {
  it("is exactly the free-chat base", () => {
    expect(buildFreeChatSystemPrompt()).toBe(FREE_CHAT_BASE);
  });

  it("carries no teaching program — free chat must not guide or gate", () => {
    for (const teachingWord of ["讲解", "练习", "提示", "引导", "问题收束", "知识点", "学习"]) {
      expect(FREE_CHAT_BASE).not.toContain(teachingWord);
    }
    expect(FREE_CHAT_BASE).toContain("任何话题");
  });

  it("carries the same uncertainty duty, both halves of it", () => {
    expect(FREE_CHAT_BASE).toContain("没把握");
    expect(FREE_CHAT_BASE).toContain("什么能定这件事");
    expect(FREE_CHAT_BASE).toContain("不加免责声明");
  });

  it("keeps the product tone floor", () => {
    expect(FREE_CHAT_BASE).toContain("不评判也不夸赞");
    for (const banned of ["真棒", "很棒", "太棒", "！"]) {
      expect(FREE_CHAT_BASE).not.toContain(banned);
    }
  });
});
