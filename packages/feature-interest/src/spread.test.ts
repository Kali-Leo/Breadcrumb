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

  it("passes a node with no embedding through unchanged", () => {
    const embeddings = [embedding("has-embedding", [1, 0])];
    const scores = new Map([["no-embedding", 0.7]]);
    const spread = spreadInterest(scores, embeddings, 0.5);
    expect(spread.get("no-embedding")).toBe(0.7);
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

/**
 * Regression (bug hunt 2026-09-03, P0-2): the result used to contain only nodes that had an
 * embedding row, and plannerRecompute reads it as the complete interest table. Embeddings are
 * backfilled asynchronously, so the nodes missing one are the nodes that just appeared — the
 * ones the learner most recently got curious about.
 */
describe("nodes the embedding backfill has not reached yet", () => {
  it("keeps the interest of a brand-new node that has no embedding row", () => {
    const embeddings = [embedding("old", [1, 0]), embedding("older", [0, 1])];
    const scores = new Map([
      ["old", 0.1],
      ["brand-new", 0.9],
    ]);
    const spread = spreadInterest(scores, embeddings, 0.3);
    expect(spread.get("brand-new")).toBe(0.9);
  });

  it("is the identity when the embedding model has never been downloaded", () => {
    // Not one embedding row in the table: every node's interest used to become 0, silently,
    // while the 推荐偏好 panel still showed the interest slider at full weight.
    const scores = new Map([
      ["a", 0.8],
      ["b", 0.2],
      ["c", 0],
    ]);
    expect(spreadInterest(scores, [], 0.3)).toEqual(scores);
  });

  it("keeps a node whose embedding row is a minority dimension", () => {
    // parseVectorRows keeps only the majority dimension count, so a row left over from an
    // older model is dropped on the way in — the node behind it must still keep its score.
    const embeddings = [
      embedding("a", [1, 0]),
      embedding("b", [0.9, 0.1]),
      embedding("stale", [1, 0, 0, 0]),
    ];
    const scores = new Map([["stale", 0.8]]);
    expect(spreadInterest(scores, embeddings, 0.3).get("stale")).toBe(0.8);
  });

  it("reports a non-finite incoming score as 0 instead of spreading it", () => {
    const embeddings = [embedding("bad", [1, 0]), embedding("near", [1, 0.05])];
    const scores = new Map([
      ["bad", Number.NaN],
      ["near", 0.5],
    ]);
    const spread = spreadInterest(scores, embeddings, 0.3);
    expect(spread.get("bad")).toBeGreaterThan(0);
    expect(Number.isFinite(spread.get("near") ?? Number.NaN)).toBe(true);
    expect(Number.isFinite(spread.get("bad") ?? Number.NaN)).toBe(true);
  });
});
