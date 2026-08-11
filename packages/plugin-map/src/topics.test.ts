/**
 * Purpose: tests for embedding-based topic discovery — cluster separation, medoid labeling,
 * no-embedding ancestor attachment, the all-no-embedding tree-root fallback, and the
 * one-member islet split. (The map itself now derives continents tree-first; see
 * continents.test.ts.)
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { discoverTopics } from "./topics";

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

    expect(assignment.topics).toHaveLength(1);
    const rTopic = assignment.topics.find((topic) => topic.memberNodeIds.includes("r"));
    expect(new Set(rTopic?.memberNodeIds)).toEqual(new Set(["r", "c", "g"]));
    // "other" clustered with nobody and has no descendants — a one-touch interest, not a topic.
    expect(assignment.islets.map((islet) => islet.id)).toEqual(["other"]);
    expect(assignment.islets[0]?.memberNodeIds).toEqual(["other"]);
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

    expect(assignment.topics).toHaveLength(1);
    const root1Topic = assignment.topics.find((topic) => topic.id === "root1");
    expect(new Set(root1Topic?.memberNodeIds)).toEqual(new Set(["root1", "root1-a", "root1-b"]));
    // 1 (root1) + 2 (root1-a override) + 1 (root1-b default) = 4
    expect(root1Topic?.weight).toBe(4);
    // The lone root2 group becomes an islet instead of a one-node continent.
    expect(assignment.islets.map((islet) => islet.id)).toEqual(["root2"]);
    expect(assignment.islets[0]?.weight).toBe(1);
  });

  it("extracts every one-member group as an islet and keeps multi-member ones as topics", () => {
    // Two tight clusters plus two loners pointing in unrelated directions.
    const nodes = [
      node("a1", null),
      node("a2", null),
      node("a3", null),
      node("b1", null),
      node("b2", null),
      node("b3", null),
      node("lone1", null),
      node("lone2", null),
    ];
    const embeddings = new Map<string, readonly number[]>([
      ["a1", [1, 0, 0, 0]],
      ["a2", [0.99, 0.02, 0, 0]],
      ["a3", [0.98, 0.03, 0, 0]],
      ["b1", [0, 1, 0, 0]],
      ["b2", [0.02, 0.99, 0, 0]],
      ["b3", [0.03, 0.98, 0, 0]],
      ["lone1", [0, 0, 1, 0]],
      ["lone2", [0, 0, 0, 1]],
    ]);

    const assignment = discoverTopics(nodes, embeddings, new Map());

    expect(assignment.topics).toHaveLength(2);
    for (const topic of assignment.topics) {
      expect(topic.memberNodeIds.length).toBeGreaterThan(1);
    }
    expect(assignment.islets.map((islet) => islet.id).sort()).toEqual(["lone1", "lone2"]);
    // Deterministic: the same input yields the same split, islets included.
    expect(discoverTopics(nodes, embeddings, new Map())).toEqual(assignment);
  });
});
