/**
 * Purpose: the cached local embeddings of the ~800 canonical concepts (migration 0046). Every
 * anchor sweep used to re-embed the entire inventory from scratch because there was nowhere
 * to keep the vectors (design audit 2026-08-28 #2); now only concepts whose embedded text
 * actually changed are recomputed, keyed by a content hash.
 * Main exports: loadConceptVectors, hashText.
 */
import type { CanonicalConceptEmbeddingRow, CanonicalConceptRow } from "@breadcrumb/core-db";
import { parseVectorColumn } from "@breadcrumb/core-db";
import { fnv1aHex8 } from "@breadcrumb/core-random";
import { getRepos } from "../platform/db";
import { embedTexts } from "../platform/embeddings";
import { nowIso } from "../platform/time";
import { conceptText } from "./canonicalConcepts";

/** Stable FNV-1a hash of the exact text that was embedded — the cache's invalidation key.
 * @breadcrumb/core-random's, the same construction feature-diglot-weave's hashContext uses
 * (2026-09-02: it was a hand-copy of it); collision risk is irrelevant here because a miss
 * only costs one re-embed. Written into canonical_concept_embeddings.content_hash, so
 * changing the construction would invalidate every cached row at once. */
export const hashText = fnv1aHex8;

/**
 * concept id -> vector for every concept given, embedding only the cache misses and writing
 * them back. Returns null when the local model is unavailable AND something actually needed
 * embedding — callers degrade the whole sweep in that case. A fully warm cache never touches
 * the model at all, so an offline run still gets its vectors.
 */
export async function loadConceptVectors(
  concepts: readonly CanonicalConceptRow[],
): Promise<Map<string, readonly number[]> | null> {
  const repos = await getRepos();
  const cachedRows = await repos.canonical.listConceptEmbeddings();
  const cached = new Map(cachedRows.map((row) => [row.concept_id, row]));

  const vectorByConceptId = new Map<string, readonly number[]>();
  const missing: { concept: CanonicalConceptRow; text: string; hash: string }[] = [];
  for (const concept of concepts) {
    const text = conceptText(concept);
    const hash = hashText(text);
    const row = cached.get(concept.id);
    const vector =
      row !== undefined && row.content_hash === hash ? parseVectorColumn(row.vector_json) : null;
    if (vector === null) {
      missing.push({ concept, text, hash });
    } else {
      vectorByConceptId.set(concept.id, vector);
    }
  }
  if (missing.length === 0) return vectorByConceptId;

  const vectors = await embedTexts(missing.map((entry) => entry.text));
  if (vectors === null) return null; // local model not ready

  const createdAt = nowIso();
  const rowsToStore: CanonicalConceptEmbeddingRow[] = [];
  for (let index = 0; index < missing.length; index += 1) {
    const entry = missing[index];
    const vector = vectors[index];
    if (entry === undefined || vector === undefined) continue;
    vectorByConceptId.set(entry.concept.id, vector);
    rowsToStore.push({
      concept_id: entry.concept.id,
      content_hash: entry.hash,
      vector_json: JSON.stringify(vector),
      created_at: createdAt,
    });
  }
  await repos.canonical.upsertConceptEmbeddings(rowsToStore);
  return vectorByConceptId;
}
