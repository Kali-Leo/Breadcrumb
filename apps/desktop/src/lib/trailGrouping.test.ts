/**
 * Purpose: unit tests for the zero-LLM trail grouping (spec 041 §2) — dominant-node picking
 * with tie-break by first sighting, top-ancestor climbing with cycle protection, and the
 * ongoing-preview/topic-group split.
 */
import type { ConversationRow, KnowledgeNodeRow, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import {
  CASUAL_CHAT_GROUP_LABEL,
  computeDominantNodes,
  groupTrails,
  topAncestorOf,
} from "./trailGrouping";

function sighting(conversationId: string, nodeId: string, createdAt: string): NodeSightingRow {
  return {
    id: `s-${conversationId}-${nodeId}-${createdAt}`,
    node_id: nodeId,
    conversation_id: conversationId,
    message_id: null,
    created_at: createdAt,
    origin_node_id: null,
  };
}

function node(id: string, parentId: string | null, label: string): KnowledgeNodeRow {
  return { id, parent_id: parentId, label, summary: "", kind: "concept", created_at: "t" };
}

function conversation(id: string, updatedAt: string): ConversationRow {
  return {
    id,
    title: id,
    created_at: updatedAt,
    updated_at: updatedAt,
    kind: "chat",
    companion_id: null,
    auto_title: null,
  };
}

describe("computeDominantNodes", () => {
  it("picks the most-sighted node per conversation", () => {
    const sightings = [
      sighting("c1", "n1", "2026-08-13T10:00:00.000Z"),
      sighting("c1", "n2", "2026-08-13T10:01:00.000Z"),
      sighting("c1", "n2", "2026-08-13T10:02:00.000Z"),
    ];
    expect(computeDominantNodes(sightings).get("c1")).toBe("n2");
  });

  it("breaks a tie by whichever node was sighted first", () => {
    const sightings = [
      sighting("c1", "n1", "2026-08-13T10:00:00.000Z"),
      sighting("c1", "n2", "2026-08-13T10:01:00.000Z"),
    ];
    expect(computeDominantNodes(sightings).get("c1")).toBe("n1");
  });

  it("has no entry for a conversation with zero sightings", () => {
    expect(computeDominantNodes([]).has("c1")).toBe(false);
  });
});

describe("topAncestorOf", () => {
  const nodesById = new Map(
    [
      node("root", null, "编程"),
      node("mid", "root", "JavaScript"),
      node("leaf", "mid", "闭包"),
    ].map((n) => [n.id, n]),
  );

  it("climbs to the root of a multi-level chain", () => {
    expect(topAncestorOf("leaf", nodesById)).toBe("root");
  });

  it("returns the node itself when it is already a root", () => {
    expect(topAncestorOf("root", nodesById)).toBe("root");
  });

  it("degrades safely instead of looping forever on a cyclic parent chain", () => {
    const cyclic = new Map([node("a", "b", "A"), node("b", "a", "B")].map((n) => [n.id, n]));
    expect(() => topAncestorOf("a", cyclic)).not.toThrow();
  });
});

describe("groupTrails", () => {
  const nodesById = new Map(
    [node("root-js", null, "JavaScript"), node("closure", "root-js", "闭包")].map((n) => [n.id, n]),
  );
  const today = "2026-08-13T00:00:00.000Z";

  it("groups by top ancestor and falls back to 随手聊 with no dominant node", () => {
    const conversations = [
      conversation("c1", "2026-08-12T09:00:00.000Z"),
      conversation("c2", "2026-08-12T09:00:00.000Z"),
    ];
    const dominantNodeByConversation = new Map<string, string | null>([
      ["c1", "closure"],
      ["c2", null],
    ]);
    const result = groupTrails({
      conversations,
      dominantNodeByConversation,
      nodesById,
      todaySinceIso: today,
    });
    const labels = result.groups.map((group) => group.label).sort();
    expect(labels).toEqual(["JavaScript", CASUAL_CHAT_GROUP_LABEL]);
  });

  it("caps 正在进行 at 3 while every today conversation still appears in its group", () => {
    const conversations = Array.from({ length: 5 }, (_, i) =>
      conversation(`c${i}`, `2026-08-13T1${i}:00:00.000Z`),
    );
    const dominantNodeByConversation = new Map<string, string | null>(
      conversations.map((c) => [c.id, "closure"]),
    );
    const result = groupTrails({
      conversations,
      dominantNodeByConversation,
      nodesById,
      todaySinceIso: today,
    });
    expect(result.ongoing).toHaveLength(3);
    expect(result.groups[0]?.trails).toHaveLength(5);
  });

  it("orders trails within a group newest first", () => {
    const conversations = [
      conversation("old", "2026-08-10T00:00:00.000Z"),
      conversation("new", "2026-08-12T00:00:00.000Z"),
    ];
    const dominantNodeByConversation = new Map<string, string | null>([
      ["old", "closure"],
      ["new", "closure"],
    ]);
    const result = groupTrails({
      conversations,
      dominantNodeByConversation,
      nodesById,
      todaySinceIso: today,
    });
    expect(result.groups[0]?.trails.map((c) => c.id)).toEqual(["new", "old"]);
  });
});
