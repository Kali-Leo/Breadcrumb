/**
 * Purpose: bench scenarios for `compare-align` — are these two names the same concept?
 *
 * It gets ground truth of its own: the canonical concept table publishes verified aliases, so
 * a label against its own alias is a "same" and a label against a different concept's alias is
 * a "different", with no reference model involved. The eleven-language batches add the failure
 * that matters most in practice — a model that answers "same" to anything merely related,
 * which is what turns the comparison tree into mush.
 *
 * Main exports: compareAlignScenarios.
 */
import {
  type AlignmentCandidatePair,
  alignmentCountsAsOverlap,
  alignmentJudgeSchema,
  buildAlignmentJudgeMessages,
  validateAlignmentVerdicts,
} from "@breadcrumb/feature-compare";
import { canonicalAliasPairs, canonicalDistinctPairs } from "../canonicalPool";
import { BENCH_LANGUAGES, demoConcepts } from "../demoPool";
import { type BenchScenario, jsonScenario } from "../scenarioTypes";
import { ratioScore } from "../scoring/textSimilarity";

/** Pairs per judge call. Well under ALIGNMENT_JUDGE_BATCH_SIZE (30) so one weak batch does
 * not swallow a whole language's score, and even in halves it is a real batched call. */
const PAIRS_PER_BATCH = 10;
/** Batches per script, from the canonical table's alias list. */
export const CANONICAL_BATCHES = 8;
interface ExpectedAlignment {
  pair: AlignmentCandidatePair;
  same: boolean;
}

function alignScenario(
  id: string,
  language: string,
  expected: readonly ExpectedAlignment[],
): BenchScenario {
  const pairs = expected.map((entry) => entry.pair);
  return jsonScenario({
    purpose: "compare-align",
    id,
    language,
    messages: buildAlignmentJudgeMessages(pairs),
    schema: alignmentJudgeSchema,
    check: (parsed) => {
      const ordered = validateAlignmentVerdicts(pairs.length, parsed);
      const correct =
        ordered === null
          ? 0
          : ordered.filter((verdict, index) => {
              const truth = expected[index]?.same ?? false;
              // Scored through the product's own rule: a low-confidence "same" is stored but
              // never counted as overlap, so here it counts as "different" too.
              return alignmentCountsAsOverlap(verdict.verdict, verdict.confidence) === truth;
            }).length;
      return {
        // The whole batch stands or falls together in the real pipeline — a batch whose
        // indices do not line up is discarded, so this is pass/fail, not a rate.
        verdictsWellFormed: ordered === null ? 0 : 1,
        goldAccuracy: ratioScore(correct, pairs.length),
      };
    },
    agree: (reference, candidate) => {
      const byPair = new Map(candidate.verdicts.map((verdict) => [verdict.pair, verdict]));
      let matched = 0;
      for (const verdict of reference.verdicts) {
        if (byPair.get(verdict.pair)?.verdict === verdict.verdict) matched += 1;
      }
      return ratioScore(matched, reference.verdicts.length);
    },
  });
}

/** Alias-versus-label (same) and alias-versus-another-concept (different), interleaved so
 * every batch holds both and a model that answers one word throughout scores 50%. */
function canonicalAlignScenarios(): BenchScenario[] {
  const scenarios: BenchScenario[] = [];
  for (const script of ["hanzi", "latin"] as const) {
    const same = canonicalAliasPairs(script);
    const different = canonicalDistinctPairs(script);
    const language = script === "hanzi" ? "zh-CN" : "en";
    for (let batch = 0; batch < CANONICAL_BATCHES; batch += 1) {
      const expected: ExpectedAlignment[] = [];
      for (let slot = 0; slot < PAIRS_PER_BATCH; slot += 1) {
        const index = batch * (PAIRS_PER_BATCH / 2) + Math.floor(slot / 2);
        const isSame = slot % 2 === 0;
        const source = isSame ? same[index % same.length] : different[index % different.length];
        if (source === undefined) continue;
        expected.push({
          same: isSame,
          pair: {
            itemKey: `i${slot}`,
            itemLabel: source.alias,
            itemContext: source.sourceRef,
            nodeId: `n${slot}`,
            nodeLabel: "label" in source ? source.label : source.otherLabel,
            nodeSummary: "",
            similarity: 0.8,
          },
        });
      }
      if (expected.length === 0) continue;
      scenarios.push(alignScenario(`compare-align/${script}/${batch}`, language, expected));
    }
  }
  return scenarios;
}

/** One batch per language of parent-versus-child pairs from the demo tree. Every one is a
 * "different" under the contract (a part is not the whole), and they are the pairs a lenient
 * judge collapses first. */
function demoAlignScenarios(): BenchScenario[] {
  return BENCH_LANGUAGES.map((language) => {
    const concepts = demoConcepts(language);
    const expected: ExpectedAlignment[] = concepts
      .slice(0, PAIRS_PER_BATCH)
      .map((concept, index) => {
        const other = concepts[(index + 1) % concepts.length];
        return {
          same: false,
          pair: {
            itemKey: `i${index}`,
            itemLabel: concept.label,
            itemContext: "demo-seed 演示学习者的知识树",
            nodeId: `n${index}`,
            nodeLabel: other?.label ?? concept.label,
            nodeSummary: other?.summary ?? concept.summary,
            similarity: 0.75,
          },
        };
      });
    return alignScenario(`compare-align/demo-${language}/0`, language, expected);
  });
}

export function compareAlignScenarios(): BenchScenario[] {
  return [...canonicalAlignScenarios(), ...demoAlignScenarios()];
}
