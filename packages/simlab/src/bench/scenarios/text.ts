/**
 * Purpose: bench scenarios for the three purposes that read a finished answer — `term-marking`
 * (which words would trip this learner up), `factcheck` (what in this answer is worth
 * verifying) and `trail-summary` (one plain sentence about yesterday).
 *
 * Each gets a reference-free check drawn from what the product does with the reply next:
 * a marked term that does not appear verbatim in the answer is dropped by locateTermPatches,
 * a claim whose words are not in the answer was invented rather than extracted, and a summary
 * carrying pressure language violates the trail's stated tone rule outright.
 *
 * Main exports: termMarkingScenarios, factcheckScenarios, trailSummaryScenarios.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import {
  buildTermMarkingMessages,
  locateTermPatches,
  termMarkResponseSchema,
} from "@breadcrumb/feature-explore";
import { buildClaimExtractionMessages, claimExtractionSchema } from "@breadcrumb/feature-factcheck";
import { buildTrailSummaryMessages, trailSummarySchema } from "@breadcrumb/feature-trail";
import { findPressureLexiconHits, loadPressureLexicons } from "../../judges/pressureLexicon";
import { BENCH_LANGUAGES, demoConcepts, demoLongAnswer, demoRounds } from "../demoPool";
import { type BenchScenario, jsonScenario } from "../scenarioTypes";
import {
  bigramCoverage,
  diceBigram,
  fuzzySetF1,
  meanScore,
  normaliseLabel,
  ratioScore,
} from "../scoring/textSimilarity";

/** How many labels the learner has already lit, and how many they have looked up — the two
 * evidence lists the real call passes. Sized off the demo tree so both are non-empty. */
const LIT_COUNT = 20;
const LOOKED_UP_COUNT = 6;

/** The three answers each language contributes: the two conversations' assistant turns joined,
 * and the teach-back response. */
function answersOf(language: string): string[] {
  const rounds = demoRounds(language);
  return [
    demoLongAnswer(language, "astro"),
    demoLongAnswer(language, "js"),
    rounds[5]?.answer ?? "",
  ];
}

export function termMarkingScenarios(): BenchScenario[] {
  const scenarios: BenchScenario[] = [];
  for (const language of BENCH_LANGUAGES) {
    const labels = demoConcepts(language).map((concept) => concept.label);
    const lit = labels.slice(0, LIT_COUNT);
    const litSet = new Set(lit.map(normaliseLabel));
    const lookedUp = labels.slice(LIT_COUNT, LIT_COUNT + LOOKED_UP_COUNT);
    answersOf(language).forEach((answer, slot) => {
      if (answer.length === 0) return;
      scenarios.push(
        jsonScenario({
          purpose: "term-marking",
          id: `term-marking/${language}/${slot}`,
          language,
          messages: buildTermMarkingMessages(answer, lit, lookedUp),
          schema: termMarkResponseSchema,
          check: (parsed) => {
            const terms = parsed.terms.map((entry) => entry.term);
            // The product's own locator: a term it cannot find is a door that never opens.
            const located = locateTermPatches(answer, terms).length;
            return {
              termsLocated: ratioScore(located, terms.length),
              notAlreadyLit: ratioScore(
                terms.filter((term) => !litSet.has(normaliseLabel(term))).length,
                terms.length,
              ),
            };
          },
          agree: (reference, candidate) =>
            fuzzySetF1(
              reference.terms.map((entry) => entry.term),
              candidate.terms.map((entry) => entry.term),
              0.8,
            ),
        }),
      );
    });
  }
  return scenarios;
}

/** The rounds fact-checking runs over: the same three exchanges the extraction purposes use,
 * so a model's behaviour on one can be read next to its behaviour on the others. */
const FACTCHECK_ROUNDS = [0, 2, 3] as const;

export function factcheckScenarios(): BenchScenario[] {
  const scenarios: BenchScenario[] = [];
  for (const language of BENCH_LANGUAGES) {
    const rounds = demoRounds(language);
    FACTCHECK_ROUNDS.forEach((roundIndex, slot) => {
      const round = rounds[roundIndex];
      if (round === undefined) return;
      scenarios.push(
        jsonScenario({
          purpose: "factcheck",
          id: `factcheck/${language}/${slot}`,
          language,
          messages: buildClaimExtractionMessages(round.question, round.answer),
          schema: claimExtractionSchema,
          check: (parsed) => ({
            // A claim is supposed to be EXTRACTED from the answer, so its words should be in
            // it. Measured by character bigrams, which works the same in every script.
            claimGrounding: meanScore(
              parsed.claims.map((claim) => bigramCoverage(claim.text, round.answer)),
            ),
            // Queries must carry the claim's own distinctive terms, not restate the topic.
            queryAnchoring: meanScore(
              parsed.claims.map((claim) =>
                Math.max(...claim.queries.map((query) => bigramCoverage(query, claim.text)), 0),
              ),
            ),
          }),
          agree: (reference, candidate) =>
            fuzzySetF1(
              reference.claims.map((claim) => claim.text),
              candidate.claims.map((claim) => claim.text),
              0.4,
            ),
        }),
      );
    });
  }
  return scenarios;
}

/** Node counts a day can leave behind: a light day, an ordinary one, a heavy one. */
const DAY_SIZES = [3, 6, 8] as const;

export function trailSummaryScenarios(): BenchScenario[] {
  const lexicons = loadPressureLexicons();
  const scenarios: BenchScenario[] = [];
  for (const language of BENCH_LANGUAGES) {
    const concepts = demoConcepts(language);
    const lexicon = lexicons[language];
    DAY_SIZES.forEach((size, slot) => {
      const dayConcepts = concepts.slice(slot * 3, slot * 3 + size);
      const nodes: KnowledgeNodeRow[] = dayConcepts.map((concept, index) => ({
        id: `n${index}`,
        parent_id: null,
        label: concept.label,
        summary: concept.summary,
        kind: "concept",
        created_at: "2026-06-01T00:00:00.000Z",
      }));
      scenarios.push(
        jsonScenario({
          purpose: "trail-summary",
          id: `trail-summary/${language}/${slot}`,
          language,
          messages: buildTrailSummaryMessages(nodes),
          schema: trailSummarySchema,
          check: (parsed) => {
            const scores: Record<string, number> = {
              // The summary states what was learned, so at least one of the day's nodes has
              // to be in it. A sentence about nothing in particular is not a trail summary.
              labelGrounding: dayConcepts.some((concept) =>
                normaliseLabel(parsed.summary).includes(normaliseLabel(concept.label)),
              )
                ? 1
                : 0,
            };
            // Only where a human-maintained lexicon exists for this language; silence from a
            // missing list is not a pass (copyGate.test.ts makes the same distinction).
            if (lexicon !== undefined) {
              scores.noPressureLanguage =
                findPressureLexiconHits(parsed.summary, lexicon).length === 0 ? 1 : 0;
            }
            return scores;
          },
          agree: (reference, candidate) => diceBigram(reference.summary, candidate.summary),
        }),
      );
    });
  }
  return scenarios;
}
