/**
 * Purpose: tests for anchor dormancy — the sweep stops paying to re-ask about a node the
 * judge has repeatedly said matches nothing, and never stops asking about anything else.
 */
import { describe, expect, it } from "vitest";
import { DORMANT_AFTER_DIFFERENT_VERDICTS, dormantNodeIds } from "./anchorDormancy";

function differents(nodeId: string, count: number) {
  return Array.from({ length: count }, () => ({ node_id: nodeId, verdict: "different" }));
}

describe("dormantNodeIds", () => {
  it("goes dormant only once the verdicts pile up", () => {
    const almost = differents("node-a", DORMANT_AFTER_DIFFERENT_VERDICTS - 1);
    expect(dormantNodeIds(almost).has("node-a")).toBe(false);
    expect(dormantNodeIds([...almost, { node_id: "node-a", verdict: "different" }])).toEqual(
      new Set(["node-a"]),
    );
  });

  it("never counts a node that did match something", () => {
    const rows = [
      ...differents("node-b", DORMANT_AFTER_DIFFERENT_VERDICTS + 3),
      { node_id: "node-b", verdict: "same" },
    ];
    expect(dormantNodeIds(rows).has("node-b")).toBe(false);
  });

  it("judges each node on its own record", () => {
    const rows = [
      ...differents("node-c", DORMANT_AFTER_DIFFERENT_VERDICTS),
      ...differents("node-d", 1),
    ];
    expect(dormantNodeIds(rows)).toEqual(new Set(["node-c"]));
  });

  it("has nothing to say about an empty history", () => {
    expect(dormantNodeIds([])).toEqual(new Set());
  });
});
