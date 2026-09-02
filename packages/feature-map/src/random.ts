/**
 * Purpose: the map's deterministic randomness, under the map's own names. Every random
 * decision in the map derives from a node id through here, and the implementation is
 * @breadcrumb/core-random's (2026-09-02 — feature-factcheck and simlab kept byte-identical
 * copies of the same FNV-1a + mulberry32 pair). The aliases stay because a map seed reads as
 * "hash this string to a seed", not "FNV-1a it".
 * Main exports: hashStringToSeed, createSeededRandom, SeededRandom.
 */

export {
  fnv1a32 as hashStringToSeed,
  mulberry32 as createSeededRandom,
  type SeededRandom,
} from "@breadcrumb/core-random";
