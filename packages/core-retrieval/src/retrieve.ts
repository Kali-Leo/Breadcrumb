/**
 * Purpose: the one call the generation layer makes — a question in, the passages to answer
 * from out — and the two-stage shape behind it.
 *
 * Stage one runs both routes to depth 100 and fuses them (rrf.ts). Stage two is optional and
 * expensive: a cross-encoder reads each candidate against the question and reorders. It is
 * worth a great deal — macro nDCG@10 0.476 → 0.750, and above every single route as well —
 * but it costs about five seconds for fifty pairs on a desktop CPU, so it is not something to
 * do on every turn. rerankPolicy.ts decides; this file only asks.
 *
 * Children are searched, parents are returned. A hit on three sentences is a precise hit and
 * three sentences are not enough to answer from, so the child's parent block is what the model
 * reads. Two children of the same parent collapse to one result, keeping the better rank —
 * otherwise a well-matched section would occupy the whole answer with three copies of itself.
 *
 * A library mid-import has a keyword index and no vectors yet. That needs no special case: the
 * vector route returns nothing, fusion of one route is that route's order, and search works
 * from the second the import finishes. It gets better on its own as the vectors land.
 * Main exports: retrieve, RetrievalDeps, RetrieveOptions, RetrievedPassage.
 */
import { analyze, matchExpression, type Stem } from "@breadcrumb/core-text";
import {
  DEFAULT_TOP_K,
  KEYWORD_WEIGHT,
  RERANK_DEPTH,
  ROUTE_DEPTH,
  VECTOR_WEIGHT,
} from "./constants";
import { fuseRrf } from "./rrf";

/** What the generation layer is handed: a parent block, and enough to cite it. */
export interface RetrievedPassage {
  id: string;
  documentId: string;
  /** "书名 → 章 → 节" — part of the evidence, not a breadcrumb for the interface. */
  headingPath: string;
  body: string;
}

export interface RetrievalDeps {
  /** BM25 over the analyzed index; ids best-first. */
  keywordSearch(match: string, limit: number): Promise<readonly string[]>;
  /** Cosine over the stored vectors; ids best-first. Empty while nothing is embedded yet. */
  vectorSearch(question: string, limit: number): Promise<readonly string[]>;
  /** Child passage id -> the parent block to read. Children with no parent are skipped. */
  resolveParents(childIds: readonly string[]): Promise<Map<string, RetrievedPassage>>;
  /** Scores each candidate against the question, in the order given. Absent, or throwing,
   * means "no second stage" — the fused order stands and the answer is still a good one. */
  rerank?(question: string, passages: readonly RetrievedPassage[]): Promise<readonly number[]>;
  /** The document language hint and stemmer the index was built with. Both sides must agree
   * or the query cuts words where the index did not. */
  language?: string;
  stem?: Stem;
}

export interface RetrieveOptions {
  topK?: number;
  /** Whether to spend the reranker on this question. The caller owns this decision because
   * only the caller knows whether the topic just changed — see rerankPolicy.ts. */
  rerank?: boolean;
}

/** Collapses children onto their parents, keeping each parent's best position. */
function parentsInOrder(
  childIds: readonly string[],
  parents: ReadonlyMap<string, RetrievedPassage>,
): RetrievedPassage[] {
  const seen = new Set<string>();
  const ordered: RetrievedPassage[] = [];
  for (const childId of childIds) {
    const parent = parents.get(childId);
    if (parent === undefined || seen.has(parent.id)) continue;
    seen.add(parent.id);
    ordered.push(parent);
  }
  return ordered;
}

/** Reorders by score, best first. A reranker that returns the wrong number of scores is not
 * trusted at all rather than partly: a mis-aligned score list would silently rank passages by
 * another passage's relevance, which looks exactly like a working reranker. */
function applyScores(
  passages: readonly RetrievedPassage[],
  scores: readonly number[],
): RetrievedPassage[] {
  if (scores.length !== passages.length) return [...passages];
  return passages
    .map((passage, index) => ({ passage, score: scores[index] ?? Number.NEGATIVE_INFINITY }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.passage);
}

export async function retrieve(
  question: string,
  deps: RetrievalDeps,
  options: RetrieveOptions = {},
): Promise<RetrievedPassage[]> {
  const topK = options.topK ?? DEFAULT_TOP_K;
  if (topK < 1) return [];
  const analyzed = analyze(question, { language: deps.language, stem: deps.stem });
  const [keywordIds, vectorIds] = await Promise.all([
    deps.keywordSearch(matchExpression(analyzed), ROUTE_DEPTH),
    deps.vectorSearch(question, ROUTE_DEPTH),
  ]);
  const fused = fuseRrf([
    { ids: keywordIds, weight: KEYWORD_WEIGHT },
    { ids: vectorIds, weight: VECTOR_WEIGHT },
  ]);
  const poolIds = fused.slice(0, RERANK_DEPTH).map((hit) => hit.id);
  const pool = parentsInOrder(poolIds, await deps.resolveParents(poolIds));
  if (options.rerank !== true || deps.rerank === undefined) return pool.slice(0, topK);
  try {
    return applyScores(pool, await deps.rerank(question, pool)).slice(0, topK);
  } catch {
    // The second stage is an improvement, never a dependency: its failure returns the answer
    // stage one already had rather than no answer.
    return pool.slice(0, topK);
  }
}
