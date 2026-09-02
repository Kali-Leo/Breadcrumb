/**
 * Purpose: the one safe way to read a JSON column back out of SQLite. A stored row is
 * external input like any other — a migration bug, a hand-edited database or a bad disk
 * write all reach the reader as the same thing — so every `*_json` column goes through a Zod
 * schema here instead of a bare `JSON.parse(...) as T`. Nothing throws: a column that will
 * not parse comes back as null so the caller can skip that one row, never the whole panel.
 * Main exports: parseJsonColumn, NodeIdsJsonSchema, VectorJsonSchema, StringListJsonSchema,
 * FsrsStabilitySchema, parseVectorColumn, parseVectorRows.
 */
import { z } from "zod";

/**
 * Parses one JSON column and validates its shape. Returns null both for malformed JSON and
 * for JSON the schema rejects — the caller decides what a missing value means (skip the row,
 * fall back to empty, treat the cache as cold); this layer never throws and never guesses.
 */
export function parseJsonColumn<Output>(schema: z.ZodType<Output>, text: string): Output | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const result = schema.safeParse(raw);
  return result.success ? result.data : null;
}

/** `goals.node_ids_json` — the knowledge node ids one goal maps to. */
export const NodeIdsJsonSchema = z.array(z.string().min(1));

/**
 * Every cached embedding column (`node_embeddings.vector_json`,
 * `canonical_concept_embeddings.vector_json`, `diglot_context_embeddings.vector_json`).
 * `.finite()` is the whole point: a NaN or Infinity that survives into a cosine silently
 * poisons an entire similarity landscape, which is strictly worse than the row being absent.
 */
export const VectorJsonSchema = z.array(z.number().finite());

/**
 * Plain string lists: `interest_signals.styles_json`, `term_marks.terms_json`,
 * `canonical_concepts.aliases_json`, `comparison_profile_items.aliases_json`.
 */
export const StringListJsonSchema = z.array(z.string());

/**
 * The one field a serialized ts-fsrs card is read for outside the scheduler itself
 * (`diglot_word_states.fsrs_json`). Deliberately narrow and loose about the rest: packages
 * that only need the memory strength must not have to model — or depend on — the full card.
 * Full revival lives with the scheduler, in plugin-diglot-weave's memoryState.ts.
 */
export const FsrsStabilitySchema = z.looseObject({ stability: z.number().finite() });

/** One embedding column, or null when it is unreadable. */
export function parseVectorColumn(vectorJson: string): number[] | null {
  return parseJsonColumn(VectorJsonSchema, vectorJson);
}

/**
 * key -> vector for a batch of embedding rows, skipping every row that cannot contribute a
 * comparable vector: unreadable JSON, a non-numeric entry, an empty vector, and — because a
 * cosine between different dimensionalities is not a smaller number but a meaningless one —
 * any row whose length disagrees with the batch's majority. A model swap that re-embedded
 * only half the tree therefore degrades to "the stale half is missing" rather than to a
 * landscape of nonsense similarities. Insertion order is preserved, and ties between two
 * equally common dimensionalities go to the one seen first, so the result is deterministic.
 */
export function parseVectorRows<Row extends { vector_json: string }>(
  rows: readonly Row[],
  keyOf: (row: Row) => string,
): Map<string, readonly number[]> {
  const parsed: { key: string; vector: number[] }[] = [];
  const countByDimensions = new Map<number, number>();
  for (const row of rows) {
    const vector = parseVectorColumn(row.vector_json);
    if (vector === null || vector.length === 0) continue;
    parsed.push({ key: keyOf(row), vector });
    countByDimensions.set(vector.length, (countByDimensions.get(vector.length) ?? 0) + 1);
  }

  let majorityDimensions = 0;
  let majorityCount = 0;
  for (const [dimensions, count] of countByDimensions) {
    if (count > majorityCount) {
      majorityDimensions = dimensions;
      majorityCount = count;
    }
  }

  const vectorByKey = new Map<string, readonly number[]>();
  for (const entry of parsed) {
    if (entry.vector.length !== majorityDimensions) continue;
    vectorByKey.set(entry.key, entry.vector);
  }
  return vectorByKey;
}
