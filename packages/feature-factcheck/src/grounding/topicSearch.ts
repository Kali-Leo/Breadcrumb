/**
 * Purpose: turning a learner's question into the searches that actually find the topic's
 * sources, and pooling what they return.
 *
 * The reason this file exists is a measured failure. The evidence layer was built for the
 * fact check, which hands it short extracted claims; given a whole question it returns
 * nothing. Wikipedia's full-text search, asked 「珠穆朗玛峰有多高，是怎么测出来的」, answers with
 * zero hits — while the same question's first clause, 「珠穆朗玛峰有多高」, returns the right
 * article first. A two-clause question is simply too long a conjunction for the index.
 *
 * So the question is cut at its own punctuation and the longest clause is asked first: the
 * clause carrying the subject is the one that finds the topic, and asking it first means the
 * passage budget fills with on-topic material before anything else is tried. The whole
 * question follows as a second query, because for an alphabetic script it usually works as
 * written (measured: the English form of the same question returns the right two articles).
 * No model call, no stopword list, no per-language table.
 * Main exports: MAX_TOPIC_QUERIES, TOPIC_QUERY_MAX_CHARS, topicQueries, gatherTopicEvidence.
 */

import type { EvidenceItem, EvidenceProvider } from "./../evidence/provider";
import { gatherEvidence } from "../gathering";

/** Two: the clause that finds the topic, and the question as the learner wrote it. A third
 * only spends requests on the parts of a question that carry no subject. */
export const MAX_TOPIC_QUERIES = 2;

/** Longer than this, a query is a paragraph rather than a search. Cut rather than dropped:
 * the head of a question is where its subject is. */
export const TOPIC_QUERY_MAX_CHARS = 120;

/** Clause boundaries across the scripts the product ships in. */
const CLAUSE_BOUNDARY = /[，,。.？?！!；;、\n]+/;

/** Below this a clause is a particle, not a search. */
const MIN_CLAUSE_CHARS = 2;

/**
 * The searches to run for one question: its longest clause first, then the whole question.
 * A question with no internal punctuation yields exactly one query.
 */
export function topicQueries(question: string): string[] {
  const whole = question.trim().slice(0, TOPIC_QUERY_MAX_CHARS);
  const clauses = whole
    .split(CLAUSE_BOUNDARY)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length >= MIN_CLAUSE_CHARS);
  const longest = clauses.reduce(
    (best, clause) => (clause.length > best.length ? clause : best),
    "",
  );
  // The second query is the clauses put back together with spaces rather than the raw string:
  // same words, no trailing 「？」 or 「.」 riding into the index as a term.
  const queries = [longest, clauses.join(" ")].filter((query) => query.length >= MIN_CLAUSE_CHARS);
  return [...new Set(queries)].slice(0, MAX_TOPIC_QUERIES);
}

/**
 * Evidence for one topic, pooled across the queries and de-duplicated by URL. Each query is
 * given whatever budget the ones before it did not use, so a query that finds nothing costs
 * the next one nothing — which is the whole point when the first query is the one that works
 * in this language and the second is the one that works in another.
 */
export async function gatherTopicEvidence(
  providers: readonly EvidenceProvider[],
  queries: readonly string[],
  limit: number,
): Promise<EvidenceItem[]> {
  const items: EvidenceItem[] = [];
  const seenUrls = new Set<string>();
  for (const query of queries) {
    if (items.length >= limit) break;
    const gathered = await gatherEvidence(providers, [query], limit - items.length);
    for (const item of gathered.items) {
      if (seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      items.push(item);
    }
  }
  return items.slice(0, limit);
}
