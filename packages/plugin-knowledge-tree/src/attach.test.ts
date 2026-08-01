/**
 * Purpose: unit tests for global-tree change planning (new nodes, re-sightings, dedupe,
 * in-batch parent links).
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { planNodeChanges } from "./attach";

let idCounter = 0;
const testDefaults = {
  conversationId: "conv-1",
  sourceMessageId: "msg-1",
  newId: () => `id-${++idCounter}`,
  nowIso: () => "2026-07-29T10:00:00Z",
};

function existingNode(id: string, label: string, parentId: string | null): KnowledgeNodeRow {
  return {
    id,
    parent_id: parentId,
    label,
    summary: "s",
    kind: "concept",
    created_at: "2026-07-28T09:00:00Z",
  };
}

describe("planNodeChanges", () => {
  it("creates a node under an existing parent and leaves a sighting", () => {
    const plan = planNodeChanges({
      ...testDefaults,
      existingNodes: [existingNode("js-1", "JavaScript", null)],
      extracted: [{ label: "闭包", summary: "函数携带其词法作用域", parentLabel: "JavaScript" }],
    });
    expect(plan.newNodes).toHaveLength(1);
    expect(plan.newNodes[0]?.parent_id).toBe("js-1");
    expect(plan.sightings).toHaveLength(1);
    expect(plan.sightings[0]?.node_id).toBe(plan.newNodes[0]?.id);
  });

  it("re-meeting a known concept records a sighting but no new node", () => {
    const plan = planNodeChanges({
      ...testDefaults,
      existingNodes: [existingNode("n1", "闭包", null)],
      extracted: [{ label: "闭包", summary: "重逢", parentLabel: null }],
    });
    expect(plan.newNodes).toHaveLength(0);
    expect(plan.sightings).toHaveLength(1);
    expect(plan.sightings[0]?.node_id).toBe("n1");
    expect(plan.sightings[0]?.conversation_id).toBe("conv-1");
  });

  it("links a node to another node created in the same batch", () => {
    const plan = planNodeChanges({
      ...testDefaults,
      existingNodes: [],
      extracted: [
        { label: "函数", summary: "一等公民", parentLabel: null },
        { label: "闭包", summary: "函数携带作用域", parentLabel: "函数" },
      ],
    });
    expect(plan.newNodes).toHaveLength(2);
    expect(plan.newNodes[1]?.parent_id).toBe(plan.newNodes[0]?.id);
    expect(plan.sightings).toHaveLength(2);
  });

  it("records at most one sighting per concept per round", () => {
    const plan = planNodeChanges({
      ...testDefaults,
      existingNodes: [existingNode("n1", "闭包", null)],
      extracted: [
        { label: "闭包", summary: "a", parentLabel: null },
        { label: "闭包", summary: "b", parentLabel: null },
      ],
    });
    expect(plan.sightings).toHaveLength(1);
  });

  it("falls back to root when parentLabel matches nothing", () => {
    const plan = planNodeChanges({
      ...testDefaults,
      existingNodes: [],
      extracted: [{ label: "闭包", summary: "s", parentLabel: "不存在的节点" }],
    });
    expect(plan.newNodes[0]?.parent_id).toBeNull();
  });
});
