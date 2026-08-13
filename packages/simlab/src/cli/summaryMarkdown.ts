/**
 * Purpose: pure mechanical aggregation of a run's metrics.json + flagged/ sample list into
 * summary.md — one section per feature (edgeNetwork/mastery/interest/planner) plus one
 * crossCutting section, in that order (spec 013 T6). No LLM calls, no re-computed numbers:
 * this is the reviewer's input draft per docs/testing/simlab-评审协议.md, not a verdict.
 * Main exports: buildSummaryMarkdown.
 */
import type { RunMetrics } from "../judges/metrics";

const MAX_FLAGGED_EXCERPTS = 10;

export function buildSummaryMarkdown(
  metrics: RunMetrics,
  flaggedFileNames: readonly string[],
): string {
  const sections = [
    header(metrics),
    edgeNetworkSection(metrics),
    masterySection(metrics),
    interestSection(metrics),
    plannerSection(metrics),
    crossCuttingSection(metrics),
    flaggedSection(flaggedFileNames),
    journeysSection(metrics),
  ];
  return `${sections.join("\n\n")}\n`;
}

function header(metrics: RunMetrics): string {
  return [
    `# simlab run summary — ${metrics.runId}`,
    "",
    "Generated mechanically by `sim summarize` — no LLM calls, no re-computed numbers. " +
      "Numbers are copied straight from metrics.json; see docs/testing/simlab-评审协议.md " +
      "for how a reviewer should (and should not) use this.",
    "",
    `- requested/completed journeys: ${metrics.requestedJourneys} / ${metrics.completedJourneys}`,
    `- cost: ¥${metrics.totalCostCny.toFixed(4)} / ¥${metrics.budgetCny} budget`,
  ].join("\n");
}

function edgeNetworkSection(metrics: RunMetrics): string {
  return [
    "## edgeNetwork",
    "",
    `- cycleRejectionCount: ${metrics.edgeNetwork.cycleRejectionCount}`,
    `- targetConceptsRecall (average across journeys): ${(metrics.edgeNetwork.targetConceptsRecall * 100).toFixed(1)}%`,
  ].join("\n");
}

function masterySection(metrics: RunMetrics): string {
  return [
    "## mastery",
    "",
    `- reencounterBoostValid: ${metrics.mastery.reencounterBoostValid}`,
    `- idleDecayValid: ${metrics.mastery.idleDecayValid}`,
    ...(metrics.mastery.detail.length > 0
      ? [`- detail: ${metrics.mastery.detail.join("; ")}`]
      : []),
  ].join("\n");
}

function interestSection(metrics: RunMetrics): string {
  return ["## interest", "", `- ${metrics.interest.note}`].join("\n");
}

function plannerSection(metrics: RunMetrics): string {
  return [
    "## planner",
    "",
    `- hardGateViolationCount (must be 0): ${metrics.planner.hardGateViolationCount}`,
    `- reasonMismatchCount: ${metrics.planner.reasonMismatchCount}`,
    `- coverageArithmeticViolationCount: ${metrics.planner.coverageArithmeticViolationCount}`,
    `- totalInvariantChecks: ${metrics.planner.totalInvariantChecks}`,
  ].join("\n");
}

function crossCuttingSection(metrics: RunMetrics): string {
  const rateLines = Object.entries(metrics.crossCutting.zodFailureRateByPurpose).map(
    ([purpose, rate]) => `  - ${purpose}: ${(rate * 100).toFixed(1)}%`,
  );
  return [
    "## crossCutting",
    "",
    "- zodFailureRateByPurpose:",
    ...(rateLines.length > 0 ? rateLines : ["  - (no calls recorded)"]),
    `- pressureLexiconHits: tutor=${metrics.crossCutting.pressureLexiconHits.tutor}, trailSummary=${metrics.crossCutting.pressureLexiconHits.trailSummary}`,
    `- degenerateTurnCount: ${metrics.crossCutting.degenerateTurnCount}`,
    `- usageContractViolationCount: ${metrics.crossCutting.usageContractViolationCount}`,
    `- parentLabelViolationCount: ${metrics.crossCutting.parentLabelViolationCount}`,
    `- digestReconciliationViolationCount: ${metrics.crossCutting.digestReconciliationViolationCount}`,
    `- frontierStalenessWarnJourneyCount (WARN, not a gate): ${metrics.crossCutting.frontierStalenessWarnJourneyCount}`,
    `- duplicateGoalTitleCount: ${metrics.crossCutting.duplicateGoalTitleCount}`,
    `- teachingDiscipline: ${metrics.crossCutting.teachingDiscipline.multiQuestionReplies} multi-question / ` +
      `${metrics.crossCutting.teachingDiscipline.overlongReplies} overlong of ` +
      `${metrics.crossCutting.teachingDiscipline.totalReplies} tutor replies`,
  ].join("\n");
}

function flaggedSection(flaggedFileNames: readonly string[]): string {
  const excerpt = flaggedFileNames.slice(0, MAX_FLAGGED_EXCERPTS);
  return [
    "## Flagged samples",
    "",
    excerpt.length === 0
      ? "(none)"
      : excerpt.map((name) => `- \`flagged/${name}\``).join("\n") +
        (flaggedFileNames.length > MAX_FLAGGED_EXCERPTS
          ? `\n- … and ${flaggedFileNames.length - MAX_FLAGGED_EXCERPTS} more`
          : ""),
  ].join("\n");
}

function journeysSection(metrics: RunMetrics): string {
  const rows = metrics.journeys.map(
    (journey) =>
      `| ${journey.journeyId} | ${journey.personaId} | ${journey.days} | ${journey.totalConversations} | ${journey.totalRounds} | ${journey.newNodeCount} | ${(journey.targetConceptsRecall * 100).toFixed(0)}% |`,
  );
  return [
    "## Journeys",
    "",
    "| journeyId | personaId | days | conversations | rounds | newNodes | recall |",
    "|---|---|---|---|---|---|---|",
    ...(rows.length > 0 ? rows : ["| (none) | | | | | | |"]),
  ].join("\n");
}
