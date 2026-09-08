/**
 * Purpose: bench scenarios for the two purposes that map free text onto an existing tree —
 * `goal-planning` ("what does this goal need?") and `self-report-mapping` ("which of these
 * do you already know?"). Both prompts spend most of their length on one rule: never invent a
 * label that is not on the list you were given. That rule is mechanically checkable, and it is
 * where cheap models fail loudly rather than subtly — a hallucinated label is a node the
 * caller silently drops, so the learner's goal quietly comes back half empty.
 *
 * The self-report texts are the demo learner's own words, and the concept each text is about
 * is demo-seed's own bookkeeping (it is where that turn's sighting is attached), so
 * `expectedHit` is ground truth rather than a reference model's opinion.
 *
 * Main exports: goalPlanningScenarios, selfReportScenarios.
 */

import { demoTextFor } from "@breadcrumb/demo-seed";
import { buildSelfReportMessages, selfReportMappingSchema } from "@breadcrumb/feature-interest";
import { buildGoalMappingMessages, goalMappingSchema } from "@breadcrumb/feature-planner";
import { BENCH_LANGUAGES, demoConcepts, demoGoalTitle } from "../demoPool";
import { type BenchScenario, jsonScenario } from "../scenarioTypes";
import {
  exactSetF1,
  fuzzySetF1,
  meanScore,
  normaliseLabel,
  ratioScore,
} from "../scoring/textSimilarity";

/** Three trees per goal: nothing known yet, a partial tree, and the whole demo landscape. */
const TREE_SIZES = [0, 18, 39] as const;

export function goalPlanningScenarios(): BenchScenario[] {
  const scenarios: BenchScenario[] = [];
  for (const language of BENCH_LANGUAGES) {
    const labels = demoConcepts(language).map((concept) => concept.label);
    TREE_SIZES.forEach((size, slot) => {
      const existing = labels.slice(0, size);
      const known = new Set(existing.map(normaliseLabel));
      scenarios.push(
        jsonScenario({
          purpose: "goal-planning",
          id: `goal-planning/${language}/${slot}`,
          language,
          messages: buildGoalMappingMessages(demoGoalTitle(language), existing),
          schema: goalMappingSchema,
          check: (parsed) => {
            const suggested = parsed.suggested.map((node) => normaliseLabel(node.label));
            const universe = new Set([...known, ...suggested]);
            const requires = parsed.suggested.flatMap((node) => node.requires ?? []);
            return {
              existingGrounded: ratioScore(
                parsed.existing.filter((label) => known.has(normaliseLabel(label))).length,
                parsed.existing.length,
              ),
              // "suggested" means "the tree does not have this yet" — re-suggesting a node
              // that is already on the list is the same mistake as inventing one.
              suggestedNovel: ratioScore(
                suggested.filter((label) => !known.has(label)).length,
                suggested.length,
              ),
              requiresGrounded: ratioScore(
                requires.filter((label) => universe.has(normaliseLabel(label))).length,
                requires.length,
              ),
            };
          },
          agree: (reference, candidate) =>
            0.5 * exactSetF1(reference.existing, candidate.existing) +
            0.5 *
              fuzzySetF1(
                reference.suggested.map((node) => node.label),
                candidate.suggested.map((node) => node.label),
              ),
        }),
      );
    });
  }
  return scenarios;
}

/** The demo learner's own three self-descriptions, and the concept each one is about. */
function selfReportTexts(language: string): { text: string; expects: string[] }[] {
  const demoText = demoTextFor(language);
  const concepts = demoText.concepts;
  return [
    { text: demoText.teachMessages[0], expects: [concepts.closures[0]] },
    { text: demoText.astroMessages[0], expects: [concepts["gravitational-lensing"][0]] },
    { text: demoText.jsMessages[0], expects: [concepts["event-loop"][0], concepts["js-root"][0]] },
  ];
}

export function selfReportScenarios(): BenchScenario[] {
  const scenarios: BenchScenario[] = [];
  for (const language of BENCH_LANGUAGES) {
    const labels = demoConcepts(language).map((concept) => concept.label);
    const known = new Set(labels.map(normaliseLabel));
    selfReportTexts(language).forEach((sample, slot) => {
      const expected = sample.expects.map(normaliseLabel);
      scenarios.push(
        jsonScenario({
          purpose: "self-report-mapping",
          id: `self-report-mapping/${language}/${slot}`,
          language,
          messages: buildSelfReportMessages(sample.text, labels),
          schema: selfReportMappingSchema,
          check: (parsed) => {
            const mapped = parsed.mappings.map((mapping) => normaliseLabel(mapping.label));
            const mappedSet = new Set(mapped);
            return {
              labelGrounded: ratioScore(
                mapped.filter((label) => known.has(label)).length,
                mapped.length,
              ),
              expectedHit: ratioScore(
                expected.filter((label) => mappedSet.has(label)).length,
                expected.length,
              ),
            };
          },
          agree: (reference, candidate) => {
            const byLabel = new Map(
              candidate.mappings.map((mapping) => [
                normaliseLabel(mapping.label),
                mapping.claimLevel,
              ]),
            );
            const levels = reference.mappings.flatMap((mapping) => {
              const other = byLabel.get(normaliseLabel(mapping.label));
              return other === undefined ? [] : [other === mapping.claimLevel ? 1 : 0];
            });
            return (
              0.7 *
                exactSetF1(
                  reference.mappings.map((mapping) => mapping.label),
                  candidate.mappings.map((mapping) => mapping.label),
                ) +
              0.3 * meanScore(levels)
            );
          },
        }),
      );
    });
  }
  return scenarios;
}
