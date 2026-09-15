/**
 * Purpose: the dense route — every stored vector, scored against the question's vector, best
 * first, each hit carrying its cosine because the relevance gate reads it.
 *
 * Brute force, deliberately. A personal library is thousands of passages, and a dot product
 * over a few thousand 384-float rows is milliseconds; an approximate index would be a second
 * data structure to build, invalidate and keep in step with the rows for no gain at this size.
 * The point at which that stops being true is tens of thousands of passages, and the honest
 * move then is an index, not a faster loop — the same call this product already made for the
 * knowledge tree (see packedVectors.ts).
 *
 * Rows whose model is not the model in use never reach here: the query that loads them filters
 * on it. Rows whose JSON will not parse are skipped rather than treated as zero vectors, and
 * rows of the wrong width are skipped by the cosine itself — a 384-dimension vector and a
 * 768-dimension one were never comparable, and a cosine over the overlap is a flattering
 * number for two things that have nothing to do with each other.
 * Main exports: rankByCosine, EMBEDDING_MODEL, parseVectorColumn.
 */

import type { LibraryPassageEmbeddingRow } from "@breadcrumb/core-db";
import { parseVectorColumn } from "@breadcrumb/core-db";
import type { RouteHit } from "@breadcrumb/core-retrieval";
import { cosineSimilarity, EMBEDDING_MODEL } from "@breadcrumb/core-vectors";

export { EMBEDDING_MODEL, parseVectorColumn };

export function rankByCosine(
  query: readonly number[],
  rows: readonly LibraryPassageEmbeddingRow[],
  limit: number,
): RouteHit[] {
  const scored: RouteHit[] = [];
  for (const row of rows) {
    const vector = parseVectorColumn(row.vector_json);
    if (vector === null) continue;
    const score = cosineSimilarity(query, vector);
    // Exactly zero is what cosineSimilarity returns for "these were never comparable" as well
    // as for "orthogonal", and neither is a result worth ranking.
    if (score === 0) continue;
    scored.push({ id: row.passage_id, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
