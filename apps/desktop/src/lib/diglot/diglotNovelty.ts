/**
 * Purpose: context novelty for review candidates (spec 033) — embeds the clause each
 * candidate word appears in and compares it against that word's stored contexts, so
 * re-meeting a word in a new setting scores higher than a repeat.
 *
 * The clause, not the whole message (audit 2026-08-28, 语言织入 #2): with a message-level
 * vector, every word in one long reply had the same context, two different replies about the
 * same topic looked identical, and "has this word been met somewhere new" could not actually
 * be answered. Side effects: one embedding call, one DB read.
 * Main exports: contextNoveltyFor, ContextNovelty.
 */
import type { DiglotPairId } from "@breadcrumb/core-db";
import { parseVectorColumn } from "@breadcrumb/core-db";
import { noveltyFactor } from "@breadcrumb/feature-diglot-weave";
import { getRepos } from "../platform/db";
import { embedTexts } from "../platform/embeddings";

export interface ContextNovelty {
  /** lemma → novelty factor in [0.5, 1.5]; empty when there was nothing to compare. */
  noveltyByLemma: Map<string, number>;
  /** lemma → the clause it appeared in, and that clause's vector. Empty when embeddings are
   * unavailable (neutral degrade: the weave still runs, novelty is 1 for everything). */
  contextByLemma: Map<string, { text: string; vector: number[] }>;
}

/** Novelty factors for the given lemmas, each in the context of its own clause. */
export async function contextNoveltyFor(input: {
  pair: DiglotPairId;
  /** lemma → the clause text that lemma occurred in. */
  clauseByLemma: ReadonlyMap<string, string>;
}): Promise<ContextNovelty> {
  const noveltyByLemma = new Map<string, number>();
  const contextByLemma = new Map<string, { text: string; vector: number[] }>();
  const lemmas = [...input.clauseByLemma.keys()];
  if (lemmas.length === 0) return { noveltyByLemma, contextByLemma };

  // One embedding call for every clause in play: the reveal path cannot afford a round trip
  // per word (audit 2026-08-28 #11), and identical clauses are embedded once.
  const uniqueClauses = [...new Set(input.clauseByLemma.values())].filter((text) => text !== "");
  const vectors = uniqueClauses.length === 0 ? null : await embedTexts(uniqueClauses);
  const vectorByClause = new Map<string, number[]>();
  if (vectors !== null) {
    uniqueClauses.forEach((clause, index) => {
      const vector = vectors[index];
      if (vector !== undefined) vectorByClause.set(clause, vector);
    });
  }

  const repos = await getRepos();
  const stored = await repos.diglot.listContextEmbeddingsForLemmas(input.pair, lemmas);
  const pastByLemma = new Map<string, number[][]>();
  for (const row of stored) {
    const vector = parseVectorColumn(row.vector_json);
    if (vector === null) continue; // an unreadable context row is one fewer comparison, not a throw
    const past = pastByLemma.get(row.lemma) ?? [];
    past.push(vector);
    pastByLemma.set(row.lemma, past);
  }

  for (const lemma of lemmas) {
    const clause = input.clauseByLemma.get(lemma) ?? "";
    const vector = vectorByClause.get(clause) ?? null;
    noveltyByLemma.set(lemma, noveltyFactor(vector, pastByLemma.get(lemma) ?? []));
    if (vector !== null) contextByLemma.set(lemma, { text: clause, vector });
  }
  return { noveltyByLemma, contextByLemma };
}
