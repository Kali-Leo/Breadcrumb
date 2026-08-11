/**
 * Purpose: tests for embedding-based topic discovery — cluster separation, medoid labeling,
 * no-embedding ancestor attachment, the all-no-embedding tree-root fallback, and the
 * weight/sizeTier quantization shapeTopicIslands derives from it.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { shapeTopicIslands } from "./topicShape";
import { discoverTopics, type TopicAssignment } from "./topics";

function node(
  id: string,
  parentId: string | null,
  createdAt = "2026-07-01T00:00:00Z",
): KnowledgeNodeRow {
  return {
    id,
    parent_id: parentId,
    label: `label-${id}`,
    summary: "",
    kind: "concept",
    created_at: createdAt,
  };
}

describe("discoverTopics", () => {
  it("splits two clearly separated embedding clusters into exactly two topics", () => {
    const nodes = [
      node("a1", null),
      node("a2", null),
      node("a3", null),
      node("a4", null),
      node("b1", null),
      node("b2", null),
      node("b3", null),
      node("b4", null),
    ];
    const embeddings = new Map<string, readonly number[]>([
      ["a1", [1, 0]],
      ["a2", [0.99, 0.02]],
      ["a3", [0.98, 0.03]],
      ["a4", [0.97, 0.04]],
      ["b1", [0, 1]],
      ["b2", [0.02, 0.99]],
      ["b3", [0.03, 0.98]],
      ["b4", [0.04, 0.97]],
    ]);
    const engagement = new Map<string, number>();

    const first = discoverTopics(nodes, embeddings, engagement);
    const second = discoverTopics(nodes, embeddings, engagement);

    expect(first).toEqual(second); // deterministic across two calls
    expect(first.topics).toHaveLength(2);
    const memberSets = first.topics.map((topic) => new Set(topic.memberNodeIds));
    expect(memberSets).toContainEqual(new Set(["a1", "a2", "a3", "a4"]));
    expect(memberSets).toContainEqual(new Set(["b1", "b2", "b3", "b4"]));
  });

  it("names a topic after its medoid — the member closest to the embedding centroid", () => {
    // Three points tightly clustered around 0°, +20°, -20°; the centroid falls exactly on
    // the 0° direction, so "center" is provably the closest member (cosine 1.0 vs 0.9397).
    const nodes = [node("center", null), node("plus20", null), node("minus20", null)];
    const embeddings = new Map<string, readonly number[]>([
      ["center", [1, 0]],
      ["plus20", [0.9397, 0.342]],
      ["minus20", [0.9397, -0.342]],
    ]);

    const assignment = discoverTopics(nodes, embeddings, new Map());

    expect(assignment.topics).toHaveLength(1);
    expect(assignment.topics[0]?.id).toBe("center");
    expect(assignment.topics[0]?.label).toBe("label-center");
  });

  it("attaches a no-embedding node to its nearest embedded ancestor's topic", () => {
    const nodes = [node("r", null), node("c", "r"), node("g", "c"), node("other", null)];
    const embeddings = new Map<string, readonly number[]>([
      ["r", [1, 0]],
      ["other", [0, 1]],
    ]);

    const assignment = discoverTopics(nodes, embeddings, new Map());

    expect(assignment.topics).toHaveLength(2);
    const rTopic = assignment.topics.find((topic) => topic.memberNodeIds.includes("r"));
    expect(new Set(rTopic?.memberNodeIds)).toEqual(new Set(["r", "c", "g"]));
    const otherTopic = assignment.topics.find((topic) => topic.id === "other");
    expect(otherTopic?.memberNodeIds).toEqual(["other"]);
  });

  it("falls back to grouping by tree root when fewer than two nodes have an embedding", () => {
    const nodes = [
      node("root1", null),
      node("root1-a", "root1"),
      node("root1-b", "root1"),
      node("root2", null),
    ];
    const engagement = new Map<string, number>([["root1-a", 2]]);

    const assignment = discoverTopics(nodes, new Map(), engagement);

    expect(assignment.topics).toHaveLength(2);
    const root1Topic = assignment.topics.find((topic) => topic.id === "root1");
    const root2Topic = assignment.topics.find((topic) => topic.id === "root2");
    expect(new Set(root1Topic?.memberNodeIds)).toEqual(new Set(["root1", "root1-a", "root1-b"]));
    // 1 (root1) + 2 (root1-a override) + 1 (root1-b default) = 4
    expect(root1Topic?.weight).toBe(4);
    expect(root2Topic?.weight).toBe(1);
    // Ordered by weight desc: root1 (4) before root2 (1).
    expect(assignment.topics.map((topic) => topic.id)).toEqual(["root1", "root2"]);
  });
});

describe("shapeTopicIslands", () => {
  it("quantizes island sizeTier 1..6 relative to the max topic weight", () => {
    const nodes = [node("light", null), node("medium", null), node("heavy", null)];
    const assignment: TopicAssignment = {
      topics: [
        { id: "light", label: "light", memberNodeIds: ["light"], weight: 1 },
        { id: "medium", label: "medium", memberNodeIds: ["medium"], weight: 3 },
        { id: "heavy", label: "heavy", memberNodeIds: ["heavy"], weight: 6 },
      ],
    };

    const islands = shapeTopicIslands(nodes, assignment);

    expect(islands.find((island) => island.label === "heavy")?.sizeTier).toBe(6);
    expect(islands.find((island) => island.label === "medium")?.sizeTier).toBe(3);
    expect(islands.find((island) => island.label === "light")?.sizeTier).toBe(1);
    for (const island of islands) {
      expect(island.nodeId.startsWith("topic:")).toBe(true);
    }
  });
});
