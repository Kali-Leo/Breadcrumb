/**
 * Purpose: the candidate pool as the reranker and the gate see it — children collapsed onto
 * the parent blocks that will actually be read, each parent carrying the best evidence any of
 * its children was found on.
 * Main exports: parentsInOrder, withCoverage.
 */
import { analyze } from "@breadcrumb/core-text";
import { keywordCoverage } from "./relevanceGate";
import type { RankedPassage, RetrievalDeps, RetrievedPassage } from "./retrieve";

/** Collapses children onto their parents, keeping each parent's best position and the best
 * of its children's evidence. */
export function parentsInOrder(
  childIds: readonly string[],
  parents: ReadonlyMap<string, RetrievedPassage>,
  cosineOf: ReadonlyMap<string, number>,
  keywordIds: ReadonlySet<string>,
): RankedPassage[] {
  const byParent = new Map<string, RankedPassage>();
  for (const childId of childIds) {
    const parent = parents.get(childId);
    if (parent === undefined) continue;
    const cosine = cosineOf.get(childId) ?? null;
    const keywordHit = keywordIds.has(childId);
    const held = byParent.get(parent.id);
    if (held === undefined) {
      const relevance = { cosine, keywordHit, rerank: null, coverage: null };
      byParent.set(parent.id, { ...parent, relevance });
      continue;
    }
    const best = held.relevance.cosine;
    held.relevance = {
      ...held.relevance,
      cosine: cosine === null ? best : best === null ? cosine : Math.max(cosine, best),
      keywordHit: held.relevance.keywordHit || keywordHit,
    };
  }
  return [...byParent.values()];
}

/** The terms a text is indexed under — tokens and stems together, as the match expression
 * reads them. */
function termsOf(text: string, deps: RetrievalDeps): Set<string> {
  const analyzed = analyze(text, { language: deps.language, stem: deps.stem });
  return new Set([...analyzed.tokens, ...analyzed.stems]);
}

/** With no vectors to ask, each passage is measured by how much of the question it holds: a
 * keyword route asked with OR matches a book on its commonest word, and that is not a hit. */
export function withCoverage(
  pool: readonly RankedPassage[],
  question: ReadonlySet<string>,
  deps: RetrievalDeps,
): RankedPassage[] {
  return pool.map((passage) => ({
    ...passage,
    relevance: {
      ...passage.relevance,
      coverage: keywordCoverage(question, termsOf(passage.body, deps)),
    },
  }));
}
