/**
 * Purpose: self-check tests proving each log-scanning tripwire fires on injected bad data and
 * stays silent on healthy data.
 */
import { describe, expect, it } from "vitest";
import {
  countDegenerateTurns,
  countParentLabelViolations,
  countUsageContractViolations,
} from "./logTripwires";

describe("countDegenerateTurns", () => {
  it("is zero when no degenerate-turn events are logged", () => {
    expect(countDegenerateTurns([{ event: "student-turn" }, { event: "tutor-turn" }])).toBe(0);
  });

  it("counts every degenerate-turn event", () => {
    const records = [
      { event: "degenerate-turn", source: "student" },
      { event: "student-turn" },
      { event: "degenerate-turn", source: "tutor" },
    ];
    expect(countDegenerateTurns(records)).toBe(2);
  });
});

describe("countUsageContractViolations", () => {
  it("is zero when every turn event carries well-formed usage", () => {
    const records = [
      { event: "student-turn", usage: { inputTokens: 10, outputTokens: 5 } },
      { event: "tutor-turn", usage: { inputTokens: 8, outputTokens: 20 } },
      { event: "pipeline-stage", purpose: "interest" }, // not a turn event: not checked
    ];
    expect(countUsageContractViolations(records)).toBe(0);
  });

  it("fires when a turn event is missing usage entirely (injected bad data)", () => {
    const records = [{ event: "student-turn", content: "..." }];
    expect(countUsageContractViolations(records)).toBe(1);
  });

  it("fires when usage is malformed (injected bad data)", () => {
    const records = [
      { event: "tutor-turn", usage: { inputTokens: "ten", outputTokens: 5 } },
      { event: "student-turn", usage: null },
    ];
    expect(countUsageContractViolations(records)).toBe(2);
  });
});

describe("countParentLabelViolations", () => {
  function treeStage(treeText: string, nodes: { label: string; parentLabel: string | null }[]) {
    return {
      event: "pipeline-stage",
      purpose: "knowledge-tree",
      request: [
        { role: "system", content: "sys" },
        { role: "user", content: `已有知识树：\n${treeText}\n\n本轮问答：\n【问】q\n【答】a` },
      ],
      response: { nodes },
    };
  }

  it("is zero for a null parentLabel", () => {
    const records = [treeStage("（空树）", [{ label: "闭包", parentLabel: null }])];
    expect(countParentLabelViolations(records)).toBe(0);
  });

  it("is zero when parentLabel matches an existing tree label", () => {
    const records = [
      treeStage("- JavaScript（顶层）", [{ label: "闭包", parentLabel: "JavaScript" }]),
    ];
    expect(countParentLabelViolations(records)).toBe(0);
  });

  it("is zero when parentLabel matches an earlier node in the same batch", () => {
    const records = [
      treeStage("（空树）", [
        { label: "函数", parentLabel: null },
        { label: "闭包", parentLabel: "函数" },
      ]),
    ];
    expect(countParentLabelViolations(records)).toBe(0);
  });

  it("does not consult parentLabel for a re-sighted node (label already known)", () => {
    const records = [
      // "闭包" already exists; the model still echoes a bogus parentLabel for it, but
      // attach.ts's planNodeChanges never reads parentLabel for a matched label.
      treeStage("- 闭包（顶层）", [{ label: "闭包", parentLabel: "不存在的节点" }]),
    ];
    expect(countParentLabelViolations(records)).toBe(0);
  });

  it("fires when parentLabel is the literal 'root'-shaped text instead of null (P7 regression, injected bad data)", () => {
    const records = [treeStage("（空树）", [{ label: "闭包", parentLabel: "根" }])];
    expect(countParentLabelViolations(records)).toBe(1);
  });

  it("fires when parentLabel references a node not yet seen in the batch or tree", () => {
    const records = [
      treeStage("（空树）", [
        { label: "闭包", parentLabel: "函数" }, // 函数 hasn't been listed yet
        { label: "函数", parentLabel: null },
      ]),
    ];
    expect(countParentLabelViolations(records)).toBe(1);
  });

  it("ignores non-knowledge-tree pipeline-stage records", () => {
    const records = [{ event: "pipeline-stage", purpose: "interest", response: { signals: [] } }];
    expect(countParentLabelViolations(records)).toBe(0);
  });
});
