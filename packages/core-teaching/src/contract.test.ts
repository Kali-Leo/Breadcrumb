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
    expect(base).toContain("用书面语");
    expect(base).toContain("不评价学习者");
    expect(base).toContain("第一句给出答案"); // fact questions: answer first
    expect(base).toContain("只提一个问题");
    expect(base).toContain("只讲一个要点");
    expect(base).toContain("先给提示"); // practice-time hint ladder
    expect(base).toContain("明显受挫"); // frustration exit
    expect(base).toContain("先指出答对的部分"); // indirect correction
  });

  it("honors an explicit direct request immediately", () => {
    expect(TEACHING_CONTRACT_BASE).toContain("要求直接讲");
    expect(TEACHING_CONTRACT_BASE).toContain("随即完整讲清");
    expect(TEACHING_CONTRACT_BASE).not.toContain("再次要求");
  });

  it("describes no reply structure the model could narrate back", () => {
    for (const scaffold of ["结论先行", "细节在后", "收束", "结尾", "分支", "一步一步"]) {
      expect(TEACHING_CONTRACT_BASE).not.toContain(scaffold);
    }
  });

  it("stays short: a rule has to earn its place", () => {
    expect(TEACHING_CONTRACT_BASE.length).toBeLessThan(480);
  });

  it("names the four situations that must be flagged as unsure", () => {
    for (const trigger of [
      "记得不确切",
      "来源之间可能不一致",
      "超出可靠的知识范围",
      "随时间变化",
    ]) {
      expect(TEACHING_CONTRACT_BASE).toContain(trigger);
    }
  });

  it("gives a checkable test for low confidence, not an introspection", () => {
    expect(TEACHING_CONTRACT_BASE).toContain("说不出出自何处");
  });

  it("demands the half that makes a hedge useful", () => {
    expect(TEACHING_CONTRACT_BASE).toContain("什么能确定它");
    expect(TEACHING_CONTRACT_BASE).toContain("宁可说不知道");
  });

  it("keeps the opposite duty — a settled answer is still given outright", () => {
    expect(TEACHING_CONTRACT_BASE).toContain("不加免责声明");
    expect(TEACHING_CONTRACT_BASE).toContain("只标出没有把握的部分");
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

  it("is one short instruction with no prohibitions", () => {
    expect(GROUNDED_TEACHING_CLAUSE.length).toBeLessThan(80);
    for (const banned of ["不许", "不要", "禁止", "不能", "不得"]) {
      expect(GROUNDED_TEACHING_CLAUSE).not.toContain(banned);
    }
  });

  it("never asks the model to write citation numbers — the code aligns them afterwards", () => {
    for (const banned of ["编号", "标注", "[1]", "序号", "引用", "自己的理解"]) {
      expect(GROUNDED_TEACHING_CLAUSE).not.toContain(banned);
    }
  });

  it("leaves the abstention clause standing rather than restating it", () => {
    expect(buildTeachingSystemPrompt({ grounded: true })).toContain("宁可说不知道");
    expect(GROUNDED_TEACHING_CLAUSE).not.toContain("宁可说不知道");
  });

  it("does not touch the free-chat contract", () => {
    expect(buildFreeChatSystemPrompt()).not.toContain("资料");
  });
});

describe("buildFreeChatSystemPrompt", () => {
  it("is exactly the free-chat base", () => {
    expect(buildFreeChatSystemPrompt()).toBe(FREE_CHAT_BASE);
  });

  it("carries no teaching program — free chat must not guide or gate", () => {
    for (const teachingWord of ["讲解", "练习", "提示", "引导", "知识点", "学习"]) {
      expect(FREE_CHAT_BASE).not.toContain(teachingWord);
    }
    expect(FREE_CHAT_BASE).toContain("任何话题");
  });

  it("carries the same uncertainty duty, both halves of it", () => {
    expect(FREE_CHAT_BASE).toContain("没有把握");
    expect(FREE_CHAT_BASE).toContain("什么能确定它");
    expect(FREE_CHAT_BASE).toContain("不加免责声明");
  });

  it("keeps the product register", () => {
    expect(FREE_CHAT_BASE).toContain("用书面语");
    expect(FREE_CHAT_BASE).toContain("不评价对方");
    for (const banned of ["真棒", "很棒", "太棒", "！"]) {
      expect(FREE_CHAT_BASE).not.toContain(banned);
    }
  });
});
