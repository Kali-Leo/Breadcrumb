/**
 * Purpose: the incremental form of topicGraph's "room" — one node's place in the similarity
 * landscape, its isolate verdict, and its gated kNN links — evaluated over a PREFIX of the
 * arrival order instead of the whole corpus, so continentGrowth can replay the map's history
 * one node at a time without paying O(n²) per step. Pure: no DB, no UI, no randomness.
 * Main exports: createPrefixRoom, PrefixRoom.
 *
 * Every rule here is topicGraph's rule, unchanged: mean/best per node (similarityLandscape),
 * the room's average closeness as the mean of those means, "an isolate is a node whose very
 * best match sits below it", and an edge that must clear the room's average AND both sides'
 * relative gates before it counts. The only thing that differs is the population: the nodes
 * admitted so far, not the nodes that will exist eventually.
 */
import type { PackedVectors, SimilarityBaseline } from "@breadcrumb/core-vectors";
import { relativeGate, similarityBetween } from "@breadcrumb/core-vectors";

/** Same neighbourhood width topicGraph's kNN graph uses. */
const K_NEAREST = 5;

export interface RoomLink {
  row: number;
  similarity: number;
}

export interface PrefixRoom {
  /** Rows admitted so far — the room is rows [0, size). */
  readonly size: number;
  /** Admits the next row (must be called with 0, 1, 2, … in order). */
  admit(): void;
  similarity(a: number, b: number): number;
  /** The gated kNN links of `row`: at most K_NEAREST, strongest first, ties by row order.
   * Identical to the neighbour list topicGraph would have drawn for this population. */
  linksFrom(row: number): RoomLink[];
}

export function createPrefixRoom(packed: PackedVectors): PrefixRoom {
  const count = packed.ids.length;
  // The all-pairs cosines, filled in as rows are admitted: each pair is computed once, so the
  // whole replay costs the one O(n²·dims) sweep similarityLandscape already cost.
  const cosines = new Float32Array(count * count);
  const sums = new Float64Array(count);
  const bests = new Float64Array(count);
  let size = 0;
  let pairSum = 0;

  function baselineAt(row: number): SimilarityBaseline {
    // Unclamped mean, exactly as similarityLandscape returns it.
    return { mean: (sums[row] ?? 0) / (size - 1), best: bests[row] ?? 0 };
  }

  /** The room's average closeness = the mean of every node's mean similarity, which telescopes
   * to twice the pair sum over n(n−1) — the same number topicGraph averages by hand. */
  function globalMean(): number {
    return size < 2 ? 0 : (2 * pairSum) / (size * (size - 1));
  }

  return {
    get size() {
      return size;
    },
    admit(): void {
      const row = size;
      for (let other = 0; other < row; other += 1) {
        const similarity = similarityBetween(packed, row, other);
        cosines[row * count + other] = similarity;
        cosines[other * count + row] = similarity;
        sums[row] = (sums[row] ?? 0) + similarity;
        sums[other] = (sums[other] ?? 0) + similarity;
        if (similarity > (bests[row] ?? 0)) bests[row] = similarity;
        if (similarity > (bests[other] ?? 0)) bests[other] = similarity;
        pairSum += similarity;
      }
      size = row + 1;
    },
    similarity(a: number, b: number): number {
      return cosines[a * count + b] ?? 0;
    },
    linksFrom(row: number): RoomLink[] {
      if (size < 2) return [];
      const average = globalMean();
      const isIsolate = (baseline: SimilarityBaseline): boolean => baseline.best < average;
      const own = baselineAt(row);
      if (isIsolate(own)) return [];
      const ownGate = relativeGate(own);
      const links: RoomLink[] = [];
      for (let other = 0; other < size; other += 1) {
        if (other === row) continue;
        const similarity = cosines[row * count + other] ?? 0;
        const otherBaseline = baselineAt(other);
        if (isIsolate(otherBaseline)) continue;
        // Above the room's average AND significant for BOTH sides — a cluster's core never
        // adopts a drifter, and degenerate tiny inputs can't fake an edge at 0.
        if (similarity <= average) continue;
        if (similarity < ownGate || similarity < relativeGate(otherBaseline)) continue;
        links.push({ row: other, similarity });
      }
      links.sort((a, b) => b.similarity - a.similarity || a.row - b.row);
      return links.slice(0, K_NEAREST);
    },
  };
}
