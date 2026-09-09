/**
 * Purpose: assembles the whole scenario suite and the two knobs a run needs — which purposes
 * to measure and how many scenarios each may contribute. Building it is pure and
 * deterministic: the same repository produces the same scenarios, in the same order, on every
 * machine, so two runs are comparable and a diff in the results is a diff in the models.
 * Main exports: buildBenchScenarios, filterScenarios, BENCH_PURPOSES, scenariosByPurpose.
 */
import type { BenchScenario } from "../scenarioTypes";
import { compareAlignScenarios } from "./align";
import { diglotScenarios } from "./diglot";
import { edgeScenarios } from "./edges";
import { interestScenarios, knowledgeTreeScenarios } from "./knowledgeTree";
import { mapNamingScenarios } from "./mapNaming";
import { goalPlanningScenarios, selfReportScenarios } from "./planning";
import { chatScenarios, companionChatScenarios, focusExplainScenarios } from "./prose";
import { factcheckScenarios, termMarkingScenarios, trailSummaryScenarios } from "./text";
import { verdictScenarios } from "./verdict";

/** Report order: the per-round pipeline first, then the on-demand features, then the two
 * conversational purposes that have no right answer. */
export const BENCH_PURPOSES: readonly string[] = [
  "knowledge-tree",
  "knowledge-edges",
  "interest",
  "term-marking",
  "diglot-weave",
  "map-naming",
  "factcheck",
  "factcheck-verdict",
  "factcheck-verdict-quote",
  "factcheck-verdict-quote3",
  "factcheck-verdict-quote6",
  "goal-planning",
  "self-report-mapping",
  "compare-align",
  "trail-summary",
  "focus-explain",
  "chat",
  "companion-chat",
];

export function buildBenchScenarios(): BenchScenario[] {
  const all = [
    ...knowledgeTreeScenarios(),
    ...edgeScenarios(),
    ...interestScenarios(),
    ...termMarkingScenarios(),
    ...diglotScenarios(),
    ...mapNamingScenarios(),
    ...factcheckScenarios(),
    ...verdictScenarios(),
    ...goalPlanningScenarios(),
    ...selfReportScenarios(),
    ...compareAlignScenarios(),
    ...trailSummaryScenarios(),
    ...focusExplainScenarios(),
    ...chatScenarios(),
    ...companionChatScenarios(),
  ];
  const order = new Map(BENCH_PURPOSES.map((purpose, index) => [purpose, index]));
  // Stable sort into report order; scenario ids stay unique, so ties keep build order.
  return [...all].sort(
    (a, b) =>
      (order.get(a.purpose) ?? BENCH_PURPOSES.length) -
      (order.get(b.purpose) ?? BENCH_PURPOSES.length),
  );
}

export function scenariosByPurpose(
  scenarios: readonly BenchScenario[],
): Map<string, BenchScenario[]> {
  const grouped = new Map<string, BenchScenario[]>();
  for (const scenario of scenarios) {
    const bucket = grouped.get(scenario.purpose) ?? [];
    bucket.push(scenario);
    grouped.set(scenario.purpose, bucket);
  }
  return grouped;
}

export interface ScenarioFilter {
  /** Only these purposes; empty or undefined means all of them. */
  purposes?: readonly string[];
  /** At most this many scenarios per purpose, taken from the front so a smoke run is a
   * prefix of the real one rather than a different sample. */
  limitPerPurpose?: number;
}

export function filterScenarios(
  scenarios: readonly BenchScenario[],
  filter: ScenarioFilter,
): BenchScenario[] {
  const wanted = filter.purposes;
  const selected =
    wanted === undefined || wanted.length === 0
      ? [...scenarios]
      : scenarios.filter((scenario) => wanted.includes(scenario.purpose));
  const limit = filter.limitPerPurpose;
  if (limit === undefined) return selected;
  const seen = new Map<string, number>();
  return selected.filter((scenario) => {
    const count = seen.get(scenario.purpose) ?? 0;
    if (count >= limit) return false;
    seen.set(scenario.purpose, count + 1);
    return true;
  });
}
