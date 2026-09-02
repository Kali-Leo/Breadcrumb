/**
 * Purpose: tests for hub-generic-node exclusion (spec 043 §7) — short label + many children,
 * high conversation-frequency, and conversation-coverage computation itself.
 */
import { describe, expect, it } from "vitest";
import {
  computeNodeConversationCoverage,
  HUB_CONVERSATION_COVERAGE_THRESHOLD,
  isHubGenericNode,
} from "./hubNodes";

describe("isHubGenericNode", () => {
  it("excludes a short label with many knowledge-tree children", () => {
    expect(isHubGenericNode({ label: "函数", childCount: 5, conversationCoverage: 0 })).toBe(true);
  });

  it("keeps a short label with few children (not yet an umbrella)", () => {
    expect(isHubGenericNode({ label: "函数", childCount: 4, conversationCoverage: 0 })).toBe(false);
  });

  it("keeps a long label regardless of child count", () => {
    expect(isHubGenericNode({ label: "光合作用", childCount: 20, conversationCoverage: 0 })).toBe(
      false,
    );
  });

  it("excludes a node that recurs in more than 30% of conversations", () => {
    expect(
      isHubGenericNode({
        label: "光合作用",
        childCount: 0,
        conversationCoverage: HUB_CONVERSATION_COVERAGE_THRESHOLD + 0.01,
      }),
    ).toBe(true);
  });

  it("keeps a node exactly at the coverage threshold (strictly greater-than excludes)", () => {
    expect(
      isHubGenericNode({
        label: "光合作用",
        childCount: 0,
        conversationCoverage: HUB_CONVERSATION_COVERAGE_THRESHOLD,
      }),
    ).toBe(false);
  });
});

describe("computeNodeConversationCoverage", () => {
  it("returns empty for no sightings", () => {
    expect(computeNodeConversationCoverage([]).size).toBe(0);
  });

  it("computes each node's share of the distinct conversations that sighted anything", () => {
    const sightings = [
      {
        id: "s1",
        node_id: "a",
        conversation_id: "c1",
        message_id: null,
        created_at: "t",
        origin_node_id: null,
      },
      {
        id: "s2",
        node_id: "a",
        conversation_id: "c2",
        message_id: null,
        created_at: "t",
        origin_node_id: null,
      },
      {
        id: "s3",
        node_id: "a",
        conversation_id: "c2",
        message_id: null,
        created_at: "t",
        origin_node_id: null,
      }, // dup conversation, still counts once
      {
        id: "s4",
        node_id: "b",
        conversation_id: "c1",
        message_id: null,
        created_at: "t",
        origin_node_id: null,
      },
      {
        id: "s5",
        node_id: "c",
        conversation_id: "c3",
        message_id: null,
        created_at: "t",
        origin_node_id: null,
      },
    ];
    const coverage = computeNodeConversationCoverage(sightings);
    // 3 distinct conversations total (c1, c2, c3).
    expect(coverage.get("a")).toBeCloseTo(2 / 3);
    expect(coverage.get("b")).toBeCloseTo(1 / 3);
    expect(coverage.get("c")).toBeCloseTo(1 / 3);
    expect(coverage.has("missing")).toBe(false);
  });
});
