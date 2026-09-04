/**
 * Purpose: performance regression guard for interest diffusion (bug hunt 2026-09-03, P3 perf).
 * spreadInterest was the only super-linear step in a recommendation recompute — 15.3 s at
 * 3000 nodes on the dev machine, ~97% of computePlannerSnapshot — because SPREAD_NEIGHBOR_TOP_K
 * trimmed the neighbour list only after every one of the n² cosines had been paid for. It now
 * runs the sweep over packed unit vectors, once per unordered pair: 1.10 s for the same input
 * end to end, 0.87 s of which is the sweep and the rest JSON-parsing 3000 vectors.
 *
 * On the tolerance: this asserts a ceiling of 5 s, not the 1.10 s measured here. A wall-clock
 * assertion has to survive a loaded CI box, a laptop on battery, and whatever else shares this
 * machine, so the ceiling is set ~4.5x the measured time and ~3x under the pre-fix time. It is a
 * tripwire for "the quadratic constant came back", not a benchmark; the numbers above are the
 * benchmark, and they belong in a comment where nothing flakes on them.
 * Vectors are shaped like e5's: one shared direction plus small noise, so nearly every pair
 * clears SPREAD_SIMILARITY_FLOOR and no candidate is skipped early — the honest worst case.
 */
import type { NodeEmbeddingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { DEFAULT_SPREAD_FACTOR, spreadInterest } from "./spread";

const NODES = 3000;
const DIMENSIONS = 384;
const CEILING_MS = 5000;

/** Deterministic LCG — a seeded generator so a slow run is never a lucky/unlucky draw. */
function makeCorpus(count: number, dimensions: number) {
  let seed = 42;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const shared = Array.from({ length: dimensions }, () => random());
  const embeddings: NodeEmbeddingRow[] = [];
  const scores = new Map<string, number>();
  for (let index = 0; index < count; index += 1) {
    const vector = shared.map((value) => value + (random() - 0.5) * 0.35);
    embeddings.push({
      node_id: `n${index}`,
      model: "test",
      vector_json: JSON.stringify(vector),
      created_at: "2026-09-03T00:00:00.000Z",
    });
    scores.set(`n${index}`, random());
  }
  return { embeddings, scores };
}

describe("spreadInterest at tree scale", () => {
  it(`diffuses ${NODES} nodes well under ${CEILING_MS} ms`, () => {
    const { embeddings, scores } = makeCorpus(NODES, DIMENSIONS);
    const startedAt = performance.now();
    const spread = spreadInterest(scores, embeddings, DEFAULT_SPREAD_FACTOR);
    const elapsedMs = performance.now() - startedAt;
    expect(spread.size).toBe(NODES);
    expect(elapsedMs).toBeLessThan(CEILING_MS);
  }, 120_000);
});
