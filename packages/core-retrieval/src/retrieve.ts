/**
 * Purpose: the one call the generation layer makes — a question in, the passages to answer
 * from out — and the two-stage shape behind it.
 *
 * Stage one runs both routes to depth 100 and fuses them (rrf.ts). Stage two is optional and
 * expensive: a cross-encoder reads each candidate against the question and reorders. It is
 * worth a great deal — macro nDCG@10 0.476 → 0.750, and above every single route as well —
 * but it costs seconds on a desktop CPU, so how deep it reads is the caller's budget
 * (rerankBudget.ts) and whether it runs at all is the caller's policy (rerankPolicy.ts).
 *
 * Children are searched, parents are returned. A hit on three sentences is a precise hit and
 * three sentences are not enough to answer from, so the child's parent block is what the model
 * reads. Two children of the same parent collapse to one result, keeping the better rank —
 * otherwise a well-matched section would occupy the whole answer with three copies of itself.
 *
 * Every passage comes back with the evidence for its own relevance — the cosine of its best
 * child, whether a keyword matched, the reranker's score if it read it — because a ranking
 * says which passage is best and never whether the best is any good. A library of one book
 * answers every question with *something*; `onlyRelevant` is what turns "the top eight of
 * an unrelated book" into "nothing here", and relevanceGate.ts holds the measured lines.
 *
 * A library mid-import has a keyword index and no vectors yet. That needs no special case: the
 * vector route returns nothing, fusion of one route is that route's order, and search works
 * from the second the import finishes. It gets better on its own as the vectors land.
 * The pool's shape — children collapsed onto parents, each carrying its evidence — is pool.ts.
 * Main exports: retrieve, RetrievalDeps, RetrieveOptions, RetrievedPassage, RankedPassage,
 * RouteHit.
 */
import { analyze, matchExpression, type Stem } from "@breadcrumb/core-text";
import {
  DEFAULT_TOP_K,
  KEYWORD_WEIGHT,
  RERANK_DEPTH,
  ROUTE_DEPTH,
  VECTOR_WEIGHT,
} from "./constants";
import { parentsInOrder, withCoverage } from "./pool";
import { isRelevant, type PassageRelevance, worthReranking } from "./relevanceGate";
import { fuseRrf } from "./rrf";

/** What the generation layer is handed: a parent block, and enough to cite it. */
export interface RetrievedPassage {
  id: string;
  documentId: string;
  /** "书名 → 章 → 节" — part of the evidence, not a breadcrumb for the interface. */
  headingPath: string;
  body: string;
}

/** A retrieved passage with the reasons it was retrieved. */
export interface RankedPassage extends RetrievedPassage {
  relevance: PassageRelevance;
}

/** One route's hit: a child id and that route's own score for it. */
export interface RouteHit {
  id: string;
  score: number;
}

export interface RetrievalDeps {
  /** BM25 over the analyzed index; ids best-first. */
  keywordSearch(match: string, limit: number): Promise<readonly string[]>;
  /** Cosine over the stored vectors; best-first. Empty while nothing is embedded yet. */
  vectorSearch(question: string, limit: number): Promise<readonly RouteHit[]>;
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
  /** How many candidates the reranker reads, at most RERANK_DEPTH. The caller knows how fast
   * its reranker is and how long the reader will wait — see rerankBudget.ts. */
  rerankDepth?: number;
  /** Drop every passage that fails the relevance gate, so that an unrelated question against
   * a full library comes back empty rather than with its eight least unrelated passages. */
  onlyRelevant?: boolean;
}

/** Reorders the first `depth` passages by score, best first, and leaves the rest in fused
 * order behind them. A reranker that returns the wrong number of scores is not trusted at all
 * rather than partly: a mis-aligned score list would silently rank passages by another
 * passage's relevance, which looks exactly like a working reranker. */
function applyScores(
  passages: readonly RankedPassage[],
  scores: readonly number[],
  depth: number,
): RankedPassage[] {
  const read = passages.slice(0, depth);
  if (scores.length !== read.length) return [...passages];
  const scored = read
    .map((passage, index) => ({
      ...passage,
      relevance: { ...passage.relevance, rerank: scores[index] ?? Number.NEGATIVE_INFINITY },
    }))
    .sort((a, b) => (b.relevance.rerank ?? 0) - (a.relevance.rerank ?? 0));
  return [...scored, ...passages.slice(depth)];
}

export async function retrieve(
  question: string,
  deps: RetrievalDeps,
  options: RetrieveOptions = {},
): Promise<RankedPassage[]> {
  const topK = options.topK ?? DEFAULT_TOP_K;
  if (topK < 1) return [];
  const analyzed = analyze(question, { language: deps.language, stem: deps.stem });
  const [keywordIds, vectorHits] = await Promise.all([
    deps.keywordSearch(matchExpression(analyzed), ROUTE_DEPTH),
    deps.vectorSearch(question, ROUTE_DEPTH),
  ]);
  const fused = fuseRrf([
    { ids: keywordIds, weight: KEYWORD_WEIGHT },
    { ids: vectorHits.map((hit) => hit.id), weight: VECTOR_WEIGHT },
  ]);
  const poolIds = fused.slice(0, RERANK_DEPTH).map((hit) => hit.id);
  const gated = options.onlyRelevant === true;
  const vectorsAnswered = vectorHits.length > 0;
  const fetched = parentsInOrder(
    poolIds,
    await deps.resolveParents(poolIds),
    new Map(vectorHits.map((hit) => [hit.id, hit.score])),
    new Set(keywordIds),
  );
  const pool =
    gated && !vectorsAnswered
      ? withCoverage(fetched, new Set([...analyzed.tokens, ...analyzed.stems]), deps)
      : fetched;
  const keep = (passages: readonly RankedPassage[]): RankedPassage[] =>
    (gated
      ? passages.filter((p) => isRelevant(p.relevance, vectorsAnswered))
      : [...passages]
    ).slice(0, topK);
  // An unrelated question is not worth the reranker's seconds: when nothing in the pool comes
  // near the question, the cross-encoder would only be confirming an empty answer.
  if (options.rerank !== true || deps.rerank === undefined || (gated && !worthReranking(pool))) {
    return keep(pool);
  }
  const depth = Math.min(options.rerankDepth ?? RERANK_DEPTH, pool.length);
  try {
    return keep(applyScores(pool, await deps.rerank(question, pool.slice(0, depth)), depth));
  } catch {
    // The second stage is an improvement, never a dependency: its failure returns the answer
    // stage one already had rather than no answer.
    return keep(pool);
  }
}
