/**
 * Purpose: unit tests for focusStore's pure helpers — the ancestor chain a question node's
 * prompt quotes, question label truncation, and the guess-gate dice roll.
 */
import type { FocusNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { buildAncestorChain, rollConceptGate, truncateQuestionLabel } from "./focusActions";

function node(partial: Partial<FocusNodeRow> & Pick<FocusNodeRow, "id">): FocusNodeRow {
  return {
    session_id: "s1",
    parent_id: null,
    kind: "word",
    label: partial.id,
    question_text: null,
    answer_text: "",
    created_at: "t",
    ...partial,
  };
}

describe("buildAncestorChain", () => {
  const nodes: FocusNodeRow[] = [
    node({ id: "root", parent_id: null, label: "闭包", answer_text: "闭包是..." }),
    node({ id: "a", parent_id: "root", label: "词法环境", answer_text: "词法环境是..." }),
    node({ id: "b", parent_id: "a", label: "作用域链", answer_text: "作用域链是..." }),
  ];

  it("walks root to the given node inclusive, root first", () => {
    expect(buildAncestorChain(nodes, "b")).toEqual([
      { label: "闭包", answerText: "闭包是..." },
      { label: "词法环境", answerText: "词法环境是..." },
      { label: "作用域链", answerText: "作用域链是..." },
    ]);
  });

  it("returns an empty chain when asking from the root itself", () => {
    expect(buildAncestorChain(nodes, null)).toEqual([]);
  });

  it("stops cleanly on a dangling parent id instead of throwing", () => {
    expect(buildAncestorChain(nodes, "missing")).toEqual([]);
  });
});

describe("truncateQuestionLabel", () => {
  it("keeps short questions as-is", () => {
    expect(truncateQuestionLabel("为什么")).toBe("为什么");
  });

  it("truncates past 12 chars with an ellipsis", () => {
    expect(truncateQuestionLabel("这是一个非常长的自由提问用来测试截断逻辑对不对")).toBe(
      "这是一个非常长的自由提问…",
    );
  });

  it("trims surrounding whitespace before measuring", () => {
    expect(truncateQuestionLabel("  为什么  ")).toBe("为什么");
  });
});

describe("rollConceptGate", () => {
  it("opens the gate when the roll is under the probability", () => {
    expect(rollConceptGate(0.5, () => 0.2)).toBe(true);
  });

  it("does not open the gate when the roll is at or above the probability", () => {
    expect(rollConceptGate(0.5, () => 0.8)).toBe(false);
    expect(rollConceptGate(0, () => 0)).toBe(false);
  });
});
