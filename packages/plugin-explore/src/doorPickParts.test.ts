/**
 * Purpose: pins the label-part matching added 2026-08-14 — canonical labels («闭包与作用域链»)
 * must still open doors when prose only contains a significant part («闭包»).
 */
import { describe, expect, it } from "vitest";
import { type DoorPickInput, pickDoors } from "./doorPick";

function baseInput(overrides: Partial<DoorPickInput>): DoorPickInput {
  return {
    messageText: "",
    messageNodes: [],
    masteryByNode: new Map(),
    curiosityByNode: new Map(),
    retentionByNode: new Map(),
    alreadyOpenedNodeIds: new Set(),
    ...overrides,
  };
}

describe("pickDoors label-part matching", () => {
  it("matches a significant part when the full label is absent", () => {
    const doors = pickDoors(
      baseInput({
        messageText: "闭包决定回调能看到什么，事件循环决定它什么时候跑。",
        messageNodes: [
          { nodeId: "n1", label: "闭包与作用域链" },
          { nodeId: "n2", label: "事件循环与微任务" },
        ],
      }),
    );
    expect(doors.map((door) => door.original)).toEqual(["闭包", "事件循环"]);
  });

  it("prefers the full label over parts when both occur", () => {
    const doors = pickDoors(
      baseInput({
        messageText: "先说闭包与作用域链，再说闭包。",
        messageNodes: [{ nodeId: "n1", label: "闭包与作用域链" }],
      }),
    );
    expect(doors[0]?.original).toBe("闭包与作用域链");
  });

  it("ignores single-character parts left by the splitter", () => {
    const doors = pickDoors(
      baseInput({
        messageText: "谈谈流的概念。",
        messageNodes: [{ nodeId: "n1", label: "流与图" }],
      }),
    );
    // «流» and «图» are single characters — too ambiguous, no door.
    expect(doors).toEqual([]);
  });

  it("splits on parentheses and slashes too", () => {
    const doors = pickDoors(
      baseInput({
        messageText: "先把递归写对再谈优化。",
        messageNodes: [{ nodeId: "n1", label: "递归（分治）" }],
      }),
    );
    expect(doors[0]?.original).toBe("递归");
  });
});
