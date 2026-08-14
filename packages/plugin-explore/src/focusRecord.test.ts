/**
 * Purpose: tests for the focus-session exit record text — single-root, multi-layer branching,
 * question-station marking, and preorder ordering (spec 042 §5 acceptance).
 */
import { describe, expect, it } from "vitest";
import { buildFocusRecordText, type FocusRecordNode } from "./focusRecord";

describe("buildFocusRecordText", () => {
  it("renders a lone root with no children", () => {
    const nodes: FocusRecordNode[] = [{ id: "root", parentId: null, kind: "word", label: "闭包" }];
    expect(buildFocusRecordText("闭包", nodes)).toBe(
      "刚才就「闭包」做了一次专注探索（1 站）。\n走过：闭包",
    );
  });

  it("walks a straight multi-layer chain in order", () => {
    const nodes: FocusRecordNode[] = [
      { id: "root", parentId: null, kind: "word", label: "闭包" },
      { id: "n2", parentId: "root", kind: "word", label: "词法环境" },
      { id: "n3", parentId: "n2", kind: "word", label: "作用域链" },
    ];
    expect(buildFocusRecordText("闭包", nodes)).toBe(
      "刚才就「闭包」做了一次专注探索（3 站）。\n走过：闭包 → 词法环境 → 作用域链",
    );
  });

  it("marks question stations with a leading ？and visits branches depth-first", () => {
    const nodes: FocusRecordNode[] = [
      { id: "root", parentId: null, kind: "word", label: "闭包" },
      { id: "n2", parentId: "root", kind: "word", label: "词法环境" },
      { id: "n3", parentId: "n2", kind: "question", label: "为什么会内存泄漏" },
      { id: "n4", parentId: "root", kind: "word", label: "垃圾回收" },
    ];
    // n2's whole subtree (its question child n3) is listed before root's second child n4.
    expect(buildFocusRecordText("闭包", nodes)).toBe(
      "刚才就「闭包」做了一次专注探索（4 站）。\n走过：闭包 → 词法环境 → ？为什么会内存泄漏 → 垃圾回收",
    );
  });

  it("keeps sibling order stable when a node has more than two children", () => {
    const nodes: FocusRecordNode[] = [
      { id: "root", parentId: null, kind: "word", label: "闭包" },
      { id: "a", parentId: "root", kind: "word", label: "A" },
      { id: "b", parentId: "root", kind: "question", label: "B" },
      { id: "c", parentId: "root", kind: "word", label: "C" },
    ];
    expect(buildFocusRecordText("闭包", nodes)).toBe(
      "刚才就「闭包」做了一次专注探索（4 站）。\n走过：闭包 → A → ？B → C",
    );
  });
});
