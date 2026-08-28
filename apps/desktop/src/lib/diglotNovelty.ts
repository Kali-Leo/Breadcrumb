/**
 * Purpose: context novelty for review candidates (spec 033) — embeds the message once with
 * the local model and compares it against each word's stored context vectors, so re-meeting
 * a word somewhere new scores higher than a repeat. Side effect: one DB read.
 * Main exports: contextNoveltyFor, ContextNovelty.
 */
import type { DiglotPairId } from "@breadcrumb/core-db";
import { noveltyFactor } from "@breadcrumb/plugin-diglot-weave";
import { getRepos } from "./db";
import { embedTexts } from "./embeddings";

export interface ContextNovelty {
  /** lemma → novelty factor in [0.5, 1.5]; empty when there was nothing to compare. */
  noveltyByLemma: Map<string, number>;
  /** The message's own vector — null when embeddings are unavailable (neutral degrade). */
  messageVector: number[] | null;
}

/** Novelty factors for the given lemmas in the context of `content`. */
export async function contextNoveltyFor(input: {
  pair: DiglotPairId;
  content: string;
  lemmas: readonly string[];
}): Promise<ContextNovelty> {
  const noveltyByLemma = new Map<string, number>();
  if (input.lemmas.length === 0) return { noveltyByLemma, messageVector: null };
  const messageVector = ((await embedTexts([input.content])) ?? [null])[0] ?? null;
  const repos = await getRepos();
  // One query for the whole message: this runs before the reply may be painted, so a round
  // trip per candidate word sat directly in the reveal path (audit 2026-08-28 #11).
  const stored = await repos.diglot.listContextEmbeddingsForLemmas(input.pair, input.lemmas);
  const pastByLemma = new Map<string, number[][]>();
  for (const row of stored) {
    const vectors = pastByLemma.get(row.lemma) ?? [];
    vectors.push(JSON.parse(row.vector_json) as number[]);
    pastByLemma.set(row.lemma, vectors);
  }
  for (const lemma of input.lemmas) {
    noveltyByLemma.set(lemma, noveltyFactor(messageVector, pastByLemma.get(lemma) ?? []));
  }
  return { noveltyByLemma, messageVector };
}
