/**
 * Purpose: pins the learner-context formatting — retention stance thresholds, style list
 * capping, confusion downshift line, and the no-empty-shell rule (spec 038 §2.3).
 */
import { describe, expect, it } from "vitest";
import { formatLearnerContextMessage } from "./learnerContext";

describe("formatLearnerContextMessage", () => {
  it("returns null when there is nothing to inject", () => {
    expect(formatLearnerContextMessage({ confusionDetected: false })).toBeNull();
    expect(
      formatLearnerContextMessage({ anchoredNodeLabel: "闭包", confusionDetected: false }),
    ).toBeNull(); // label without retention is not enough
  });

  it("low retention prescribes teaching from basics", () => {
    const message = formatLearnerContextMessage({
      anchoredNodeLabel: "闭包",
      retention: 0.3,
      confusionDetected: false,
    });
    expect(message).toContain("约 30%");
    expect(message).toContain("从基础直接讲起");
  });

  it("mid retention prescribes try-first (the elicitation sweet spot)", () => {
    const message = formatLearnerContextMessage({
      anchoredNodeLabel: "闭包",
      retention: 0.55,
      confusionDetected: false,
    });
    expect(message).toContain("先让对方试一步");
  });

  it("high retention prescribes skipping basics and dropping assistance", () => {
    const message = formatLearnerContextMessage({
      anchoredNodeLabel: "闭包",
      retention: 0.85,
      hasPrincipledMastery: true,
      confusionDetected: false,
    });
    expect(message).toContain("跳过基础复述");
    expect(message).toContain("讲出原理的记录");
  });

  it("clamps out-of-range retention instead of printing nonsense", () => {
    const message = formatLearnerContextMessage({
      anchoredNodeLabel: "闭包",
      retention: 1.7,
      confusionDetected: false,
    });
    expect(message).toContain("约 100%");
  });

  it("caps preferred styles at three and keeps order", () => {
    const message = formatLearnerContextMessage({
      preferredStyles: ["类比", "代码示例", "图示", "形式化推导"],
      confusionDetected: false,
    });
    expect(message).toContain("类比、代码示例、图示");
    expect(message).not.toContain("形式化推导");
  });

  it("confusion alone is enough to produce a downshift message", () => {
    const message = formatLearnerContextMessage({ confusionDetected: true });
    expect(message).toContain("换一种讲法");
    expect(message).toContain("归因于材料");
  });

  it("header tells the model to keep the numbers to itself", () => {
    const message = formatLearnerContextMessage({ confusionDetected: true });
    expect(message).toContain("不要向对方复述");
  });
});
