/**
 * Purpose: bench scenarios for `knowledge-edges`, the one purpose that can be scored against
 * human judgement instead of against another model. Two hand-authored sources feed it:
 * simlab's own gold-prerequisites.json (115 pairs in ten languages, direction included) and
 * demo-seed's goal decomposition (twelve prerequisite edges, rendered in all eleven interface
 * languages), plus cross-domain pairs that carry no learning relation at all.
 *
 * So the headline number here — `goldAccuracy` — owes nothing to the reference model. It is
 * the most trustworthy column in the whole report.
 *
 * Main exports: edgeScenarios.
 */
import {
  buildEdgeJudgeMessages,
  type EdgeJudgeCandidatePair,
  edgeJudgeSchema,
  type PairJudgement,
} from "@breadcrumb/feature-graph";
import { loadGoldPairs, summariseConcept } from "../../judges/goldBaseline";
import { BENCH_LANGUAGES, demoRequiresPairs, demoUnrelatedPairs } from "../demoPool";
import { type BenchScenario, jsonScenario } from "../scenarioTypes";
import { ratioScore } from "../scoring/textSimilarity";

/** edgeJudgeSchema caps `edges` at 20, so a batch may never exceed it. */
const MAX_BATCH = 20;
/** Demo batches stay smaller: 12 pairs is one full requires set or one full unrelated set,
 * which keeps each scenario about a single kind of judgement. */
const DEMO_BATCH = 12;

type Expected = "requires" | "unrelated";

interface ExpectedPair extends EdgeJudgeCandidatePair {
  expected: Expected;
}

function chunk<Item>(items: readonly Item[], size: number): Item[][] {
  const chunks: Item[][] = [];
  for (let start = 0; start < items.length; start += size)
    chunks.push(items.slice(start, start + size));
  return chunks;
}

/** Scored exactly as goldBaseline scores it: a `requires` pair is right only when the judge
 * says requires AND puts A first; an `unrelated` pair is right only when the judge says
 * unrelated. "helps" on a hard prerequisite is a wrong answer, not a near miss. */
function isCorrect(expected: Expected, judgement: PairJudgement): boolean {
  return expected === "requires"
    ? judgement.relation === "requires" && judgement.direction === "aToB"
    : judgement.relation === "unrelated";
}

/** The contract's own shape rule: requires carries a direction and no weight tier, helps
 * carries a weight tier. A model that fills both, or neither, produced an edge the planner
 * cannot store as written. */
function isWellShaped(judgement: PairJudgement): boolean {
  if (judgement.relation === "requires") return judgement.direction !== null;
  if (judgement.relation === "helps") return judgement.weight !== null;
  return true;
}

function edgeScenario(id: string, language: string, pairs: readonly ExpectedPair[]): BenchScenario {
  const expectedById = new Map(pairs.map((pair) => [pair.pairId, pair.expected]));
  return jsonScenario({
    purpose: "knowledge-edges",
    id,
    language,
    messages: buildEdgeJudgeMessages(pairs),
    schema: edgeJudgeSchema,
    check: (parsed) => {
      const judged = parsed.edges.flatMap((edge) => {
        const expected = expectedById.get(edge.pairId);
        return expected === undefined ? [] : [{ expected, edge }];
      });
      const requires = judged.filter((item) => item.expected === "requires");
      const unrelated = judged.filter((item) => item.expected === "unrelated");
      const correct = judged.filter((item) => isCorrect(item.expected, item.edge)).length;
      const requiresAsked = pairs.filter((pair) => pair.expected === "requires").length;
      const unrelatedAsked = pairs.length - requiresAsked;
      const scores: Record<string, number> = {
        pairCoverage: ratioScore(judged.length, pairs.length),
        // Scored over every pair asked about, not just the ones answered: a pair the model
        // silently dropped is a pair it got wrong, which is how the pipeline experiences it.
        goldAccuracy: ratioScore(correct, pairs.length),
        shapeValid: ratioScore(
          judged.filter((item) => isWellShaped(item.edge)).length,
          judged.length,
        ),
      };
      // Emitted only when the batch actually asked that kind of question: a rate over an
      // empty denominator is not a 100%, it is an absence, and averaging it in would flatter
      // every model by the number of batches that never posed the question.
      if (requiresAsked > 0) {
        scores.directionAccuracy = ratioScore(
          requires.filter((item) => isCorrect("requires", item.edge)).length,
          requiresAsked,
        );
      }
      if (unrelatedAsked > 0) {
        scores.unrelatedRejection = ratioScore(
          unrelated.filter((item) => isCorrect("unrelated", item.edge)).length,
          unrelatedAsked,
        );
      }
      return scores;
    },
    agree: (reference, candidate) => {
      const byId = new Map(candidate.edges.map((edge) => [edge.pairId, edge]));
      let matched = 0;
      for (const edge of reference.edges) {
        const other = byId.get(edge.pairId);
        if (other === undefined) continue;
        if (other.relation === edge.relation && other.direction === edge.direction) matched += 1;
      }
      return ratioScore(matched, reference.edges.length);
    },
  });
}

/** The hand-authored gold file, one scenario per batch, never mixing languages inside a
 * batch — a Bengali label under a Chinese summary measures tolerance for mixed input rather
 * than accuracy (goldBaseline.ts makes the same point). */
function goldScenarios(): BenchScenario[] {
  const byLanguage = new Map<string, ExpectedPair[]>();
  loadGoldPairs().forEach((pair, index) => {
    const bucket = byLanguage.get(pair.lang) ?? [];
    bucket.push({
      pairId: `g${index}`,
      nodeALabel: pair.a,
      nodeASummary: summariseConcept(pair.a, pair.lang),
      nodeBLabel: pair.b,
      nodeBSummary: summariseConcept(pair.b, pair.lang),
      expected: pair.relation,
    });
    byLanguage.set(pair.lang, bucket);
  });
  const scenarios: BenchScenario[] = [];
  for (const [language, pairs] of [...byLanguage].sort(([a], [b]) => a.localeCompare(b))) {
    chunk(pairs, MAX_BATCH).forEach((batch, index) => {
      scenarios.push(edgeScenario(`knowledge-edges/gold-${language}/${index}`, language, batch));
    });
  }
  return scenarios;
}

/** demo-seed's goal DAG and its two unrelated domains, in every interface language — the
 * half of the set that covers languages the gold file has no pairs for. */
function demoScenarios(): BenchScenario[] {
  const scenarios: BenchScenario[] = [];
  for (const language of BENCH_LANGUAGES) {
    const requires: ExpectedPair[] = demoRequiresPairs(language).map((pair, index) => ({
      pairId: `r${index}`,
      nodeALabel: pair.aLabel,
      nodeASummary: pair.aSummary,
      nodeBLabel: pair.bLabel,
      nodeBSummary: pair.bSummary,
      expected: "requires",
    }));
    const unrelated: ExpectedPair[] = demoUnrelatedPairs(language).map((pair, index) => ({
      pairId: `u${index}`,
      nodeALabel: pair.aLabel,
      nodeASummary: pair.aSummary,
      nodeBLabel: pair.bLabel,
      nodeBSummary: pair.bSummary,
      expected: "unrelated",
    }));
    chunk(requires, DEMO_BATCH).forEach((batch, index) => {
      scenarios.push(
        edgeScenario(`knowledge-edges/demo-req-${language}/${index}`, language, batch),
      );
    });
    chunk(unrelated, DEMO_BATCH).forEach((batch, index) => {
      scenarios.push(
        edgeScenario(`knowledge-edges/demo-unr-${language}/${index}`, language, batch),
      );
    });
  }
  return scenarios;
}

export function edgeScenarios(): BenchScenario[] {
  return [...goldScenarios(), ...demoScenarios()];
}
