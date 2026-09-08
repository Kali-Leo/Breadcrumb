/**
 * Purpose: bench scenarios for the two per-round extraction purposes — `knowledge-tree`
 * (which knowledge points did this exchange touch, and where do they hang) and `interest`
 * (what did the learner's mood look like on each of them). Both run the product's own
 * message builders over demo-seed's real exchanges, in all eleven interface languages and
 * against trees of three different sizes, because a prompt that works on an empty tree and
 * collapses on a 39-node one is exactly the failure this bench exists to catch.
 *
 * Main exports: knowledgeTreeScenarios, interestScenarios.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import {
  buildInterestMessages,
  type InterestSignalsResult,
  interestSignalsSchema,
} from "@breadcrumb/feature-interest";
import {
  buildExtractionMessages,
  extractionResponseSchema,
} from "@breadcrumb/feature-knowledge-tree";
import { BENCH_LANGUAGES, demoConcepts, demoRounds } from "../demoPool";
import { type BenchScenario, jsonScenario } from "../scenarioTypes";
import {
  exactSetF1,
  meanScore,
  normaliseLabel,
  ordinalAgreement,
  ratioScore,
} from "../scoring/textSimilarity";

/** Tree sizes one scenario each: a brand-new learner, a fortnight in, and the whole demo
 * landscape. Rotated with the round index so every size meets every kind of exchange. */
const TREE_SIZES = [0, 12, 39] as const;

/** The three exchanges used per language: the two conversations' opening rounds and the
 * astronomy review round, which is the one that re-sights existing nodes. */
const ROUND_INDEXES = [0, 2, 3] as const;

function treeOf(language: string, size: number): KnowledgeNodeRow[] {
  return demoConcepts(language)
    .slice(0, size)
    .map((concept, index) => ({
      id: `n${index}`,
      // Every fifth node is a root and the rest hang off the most recent one — the shape
      // extraction actually produces, and the shape purposeUsage measures against.
      parent_id: index % 5 === 0 ? null : `n${index - (index % 5)}`,
      label: concept.label,
      summary: concept.summary,
      kind: "concept" as const,
      created_at: "2026-06-01T00:00:00.000Z",
    }));
}

/**
 * Scenarios for `knowledge-tree`. The reference-free check is whether every `parentLabel`
 * names a node that exists — the prompt spends five lines forbidding descriptive filler like
 * "顶层" there, and a model that ignores it produces nodes the attach step has to drop.
 */
export function knowledgeTreeScenarios(): BenchScenario[] {
  const scenarios: BenchScenario[] = [];
  for (const language of BENCH_LANGUAGES) {
    const rounds = demoRounds(language);
    ROUND_INDEXES.forEach((roundIndex, slot) => {
      const round = rounds[roundIndex];
      if (round === undefined) return;
      const size = TREE_SIZES[slot % TREE_SIZES.length] ?? 0;
      const tree = treeOf(language, size);
      const known = new Set(tree.map((node) => normaliseLabel(node.label)));
      scenarios.push(
        jsonScenario({
          purpose: "knowledge-tree",
          id: `knowledge-tree/${language}/${slot}`,
          language,
          messages: buildExtractionMessages(tree, round.question, round.answer),
          schema: extractionResponseSchema,
          check: (parsed) => {
            const batch = new Set(parsed.nodes.map((node) => normaliseLabel(node.label)));
            const grounded = parsed.nodes.filter(
              (node) =>
                node.parentLabel === null ||
                known.has(normaliseLabel(node.parentLabel)) ||
                batch.has(normaliseLabel(node.parentLabel)),
            ).length;
            return {
              parentGrounded: ratioScore(grounded, parsed.nodes.length),
              producedNodes: parsed.nodes.length > 0 ? 1 : 0,
            };
          },
          agree: (reference, candidate) =>
            exactSetF1(
              reference.nodes.map((node) => node.label),
              candidate.nodes.map((node) => node.label),
            ),
        }),
      );
    });
  }
  return scenarios;
}

const INTEREST_TIERS = ["none", "weak", "medium", "strong"] as const;
const CONFIDENCE_TIERS = ["low", "medium", "high"] as const;

function tierAgreement(
  reference: InterestSignalsResult["signals"][number],
  candidate: InterestSignalsResult["signals"][number],
): number {
  return meanScore([
    ordinalAgreement(INTEREST_TIERS, reference.curiosity, candidate.curiosity),
    ordinalAgreement(INTEREST_TIERS, reference.confusion, candidate.confusion),
    ordinalAgreement(INTEREST_TIERS, reference.boredom, candidate.boredom),
    ordinalAgreement(CONFIDENCE_TIERS, reference.confidence, candidate.confidence),
  ]);
}

/**
 * Scenarios for `interest`. Two reference-free checks, both of which are contract rules the
 * prompt states outright: every node handed over must come back with a signal (coverage), and
 * nothing else may (grounding — an invented label maps to no node and is silently dropped).
 * Agreement weighs the label set and the tier picks equally: naming the right nodes with the
 * wrong mood is half an answer, and so is the reverse.
 */
export function interestScenarios(): BenchScenario[] {
  const scenarios: BenchScenario[] = [];
  for (const language of BENCH_LANGUAGES) {
    const rounds = demoRounds(language);
    ROUND_INDEXES.forEach((roundIndex, slot) => {
      const round = rounds[roundIndex];
      if (round === undefined) return;
      const nodes = round.concepts.map((label, index) => ({ nodeId: `n${index}`, label }));
      const asked = new Set(nodes.map((node) => normaliseLabel(node.label)));
      scenarios.push(
        jsonScenario({
          purpose: "interest",
          id: `interest/${language}/${slot}`,
          language,
          messages: buildInterestMessages(nodes, round.question, round.answer),
          schema: interestSignalsSchema,
          check: (parsed) => {
            const returned = parsed.signals.map((signal) => normaliseLabel(signal.label));
            const returnedSet = new Set(returned);
            const covered = [...asked].filter((label) => returnedSet.has(label)).length;
            const grounded = returned.filter((label) => asked.has(label)).length;
            return {
              labelCoverage: ratioScore(covered, asked.size),
              labelGrounded: ratioScore(grounded, returned.length),
            };
          },
          agree: (reference, candidate) => {
            const byLabel = new Map(
              candidate.signals.map((signal) => [normaliseLabel(signal.label), signal]),
            );
            const tiers: number[] = [];
            for (const signal of reference.signals) {
              const match = byLabel.get(normaliseLabel(signal.label));
              if (match !== undefined) tiers.push(tierAgreement(signal, match));
            }
            const labelScore = exactSetF1(
              reference.signals.map((signal) => signal.label),
              candidate.signals.map((signal) => signal.label),
            );
            return 0.5 * labelScore + 0.5 * meanScore(tiers);
          },
        }),
      );
    });
  }
  return scenarios;
}
