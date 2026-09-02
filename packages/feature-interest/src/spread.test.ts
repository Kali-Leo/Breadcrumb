/**
 * Purpose: deterministic tests for cosine-similarity interest diffusion.
 */
import type { NodeEmbeddingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { SPREAD_NEIGHBOR_TOP_K, spreadInterest } from "./spread";

function embedding(nodeId: string, vector: number[]): NodeEmbeddingRow {
  return {
    node_id: nodeId,
    model: "test",
    vector_json: JSON.stringify(vector),
    created_at: "2026-07-29T00:00:00Z",
  };
}

describe("spreadInterest", () => {
  it("lifts a neighbor with no signal of its own toward a nearby interested node", () => {
    const embeddings = [embedding("interested", [1, 0]), embedding("neighbor", [0.9, 0.1])];
    const scores = new Map([["interested", 1]]);
    const spread = spreadInterest(scores, embeddings, 0.5);
    expect(spread.get("neighbor") ?? 0).toBeGreaterThan(0);
    expect(spread.get("neighbor") ?? 0).toBeLessThan(1);
  });

  it("never lowers a node's own score", () => {
    const embeddings = [embedding("bored", [1, 0]), embedding("other", [0.9, 0.1])];
    const scores = new Map([
      ["bored", 0.9],
      ["other", 0],
    ]);
    const spread = spreadInterest(scores, embeddings, 0.8);
    expect(spread.get("bored") ?? 0).toBeGreaterThanOrEqual(0.9);
  });

  it("leaves an orthogonal (unrelated) node unaffected", () => {
    const embeddings = [embedding("interested", [1, 0]), embedding("unrelated", [0, 1])];
    const scores = new Map([["interested", 1]]);
    const spread = spreadInterest(scores, embeddings, 0.5);
    expect(spread.get("unrelated") ?? 0).toBe(0);
  });

  it("passes through unchanged when a node has no embedding", () => {
    const embeddings = [embedding("has-embedding", [1, 0])];
    const scores = new Map([["no-embedding", 0.7]]);
    const spread = spreadInterest(scores, embeddings, 0.5);
    expect(spread.has("no-embedding")).toBe(false);
    expect(spread.get("has-embedding") ?? 0).toBe(0);
  });

  it("is a no-op at factor 0", () => {
    const embeddings = [embedding("a", [1, 0]), embedding("b", [0.9, 0.1])];
    const scores = new Map([
      ["a", 1],
      ["b", 0],
    ]);
    const spread = spreadInterest(scores, embeddings, 0);
    expect(spread.get("b")).toBe(0);
  });
});

describe("spreadInterest neighborhood bounds (2026-08-28 audit)", () => {
  it("ignores a node below the similarity floor even though its cosine is positive", () => {
    // cos ≈ 0.243, positive but nowhere near a neighbor. Before the floor, every faintly
    // positive node joined the weighted average and diffusion degenerated into adding a
    // global mean interest to everything.
    const embeddings = [embedding("interested", [1, 0]), embedding("far", [0.25, 1])];
    const spread = spreadInterest(new Map([["interested", 1]]), embeddings, 0.5);
    expect(spread.get("far")).toBe(0);
  });

  it("keeps a node above the similarity floor", () => {
    // cos ≈ 0.707 — a real neighbor, still diffused.
    const embeddings = [embedding("interested", [1, 0]), embedding("near", [1, 1])];
    const spread = spreadInterest(new Map([["interested", 1]]), embeddings, 0.5);
    expect(spread.get("near") ?? 0).toBeGreaterThan(0);
  });

  it("averages over at most SPREAD_NEIGHBOR_TOP_K neighbors, closest first", () => {
    // Nine qualifying neighbors: the eight closest all score 0, the ninth (least similar)
    // scores 1. With top-K truncation the ninth never enters the average.
    const scores = new Map<string, number>();
    const embeddings = [embedding("target", [1, 0])];
    for (let index = 0; index < SPREAD_NEIGHBOR_TOP_K + 1; index += 1) {
      const id = `n${index}`;
      // Increasing y tilts each successive neighbor further from [1, 0].
      embeddings.push(embedding(id, [1, 0.05 * (index + 1)]));
      scores.set(id, index === SPREAD_NEIGHBOR_TOP_K ? 1 : 0);
    }
    const spread = spreadInterest(scores, embeddings, 0.5);
    expect(spread.get("target")).toBe(0);
  });
});
