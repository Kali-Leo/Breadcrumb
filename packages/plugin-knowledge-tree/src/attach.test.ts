/**
 * Purpose: unit tests for tree-attachment planning (parent resolution, dedupe, batch links).
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { planNodeInserts } from "./attach";

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
    conversation_id: "conv-1",
    parent_id: parentId,
    label,
    summary: "s",
    source_message_id: null,
    created_at: "2026-07-29T09:00:00Z",
  };
}

describe("planNodeInserts", () => {
  it("attaches to an existing node by parentLabel", () => {
    const rows = planNodeInserts({
      ...testDefaults,
      existingNodes: [existingNode("js-1", "JavaScript", null)],
      extracted: [{ label: "闭包", summary: "函数携带其词法作用域", parentLabel: "JavaScript" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.parent_id).toBe("js-1");
  });

  it("links a node to another node created in the same batch", () => {
    const rows = planNodeInserts({
      ...testDefaults,
      existingNodes: [],
      extracted: [
        { label: "函数", summary: "一等公民", parentLabel: null },
        { label: "闭包", summary: "函数携带作用域", parentLabel: "函数" },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]?.parent_id).toBe(rows[0]?.id);
  });

  it("skips labels that already exist in the tree", () => {
    const rows = planNodeInserts({
      ...testDefaults,
      existingNodes: [existingNode("n1", "闭包", null)],
      extracted: [{ label: "闭包", summary: "重复", parentLabel: null }],
    });
    expect(rows).toHaveLength(0);
  });

  it("falls back to root when parentLabel matches nothing", () => {
    const rows = planNodeInserts({
      ...testDefaults,
      existingNodes: [],
      extracted: [{ label: "闭包", summary: "s", parentLabel: "不存在的节点" }],
    });
    expect(rows[0]?.parent_id).toBeNull();
  });
});
