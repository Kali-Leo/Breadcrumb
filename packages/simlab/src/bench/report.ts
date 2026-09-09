/**
 * Purpose: renders an aggregated run as the table a person actually reads — models down the
 * columns, purposes down the rows, one section per question: does the reply parse, does it
 * agree with the reference, how fast is it, what does it cost, and what do the ground-truth
 * checks say.
 *
 * Everything here is derived from the results file next to it; the report is a view, never a
 * second source of numbers.
 * Main exports: renderBenchReport.
 */
import { formatCost, type ModelRates } from "@breadcrumb/core-llm";
import type { AggregatedRun, ModelSummary, PurposeSummary } from "./aggregate";

function pct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(0)}%`;
}

function row(cells: readonly string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function header(cells: readonly string[]): string[] {
  return [row(cells), row(cells.map(() => "---"))];
}

function purposeOf(model: ModelSummary, purpose: string): PurposeSummary | undefined {
  return model.byPurpose.find((entry) => entry.purpose === purpose);
}

function matrix(
  run: AggregatedRun,
  title: string,
  note: string,
  cell: (summary: PurposeSummary | undefined) => string,
): string[] {
  const names = run.models.map((model) => model.modelId);
  const lines = [`### ${title}`, "", note, "", ...header(["purpose", ...names])];
  for (const purpose of run.purposes) {
    lines.push(row([purpose, ...run.models.map((model) => cell(purposeOf(model, purpose)))]));
  }
  lines.push("");
  return lines;
}

/** Check names worth putting in the report: the ones that are ground truth or a hard contract
 * rule, rather than a diagnostic that only means something next to its own scenario. */
const HEADLINE_CHECKS: readonly string[] = [
  "goldAccuracy",
  "abstainsWhenShould",
  "overCautionRate",
  "fabricatesSpecific",
  "assertsSpecificValue",
  "namesWhatWouldSettle",
  "expectedFactHit",
  "verdictAccuracy",
  "falseSupportRate",
  "hardFalseSupportRate",
  "abstentionRate",
  "abstentionPrecision",
  "abstentionRecall",
  "supportRecall",
  "contradictionRecall",
  "citedDecisive",
  "quoteGrounded",
  "quoteInCited",
  "gateDowngrade",
  "rawVerdictAccuracy",
  "rawFalseSupportRate",
  "rawAbstentionRate",
  "directionAccuracy",
  "unrelatedRejection",
  "expectedHit",
  "labelGrounded",
  "existingGrounded",
  "requiresGrounded",
  "parentGrounded",
  "labelCoverage",
  "pairCoverage",
  "verdictsWellFormed",
  "termsLocated",
  "changesAccepted",
  "idCoverage",
  "claimGrounding",
  "noPressureLanguage",
  "noManipulation",
  "languageMatch",
  "oneQuestionMax",
];

function checkSections(run: AggregatedRun): string[] {
  const lines = ["### 逐环节硬指标（不依赖参考模型）", ""];
  lines.push(
    "每一格是该环节所有场景的均值，只统计真正报告了这一项的调用。",
    "",
    ...header(["purpose", "check", ...run.models.map((model) => model.modelId)]),
  );
  for (const purpose of run.purposes) {
    const names = new Set<string>();
    for (const model of run.models) {
      for (const name of Object.keys(purposeOf(model, purpose)?.checks ?? {})) {
        if (HEADLINE_CHECKS.includes(name)) names.add(name);
      }
    }
    for (const name of [...names].sort()) {
      lines.push(
        row([
          purpose,
          name,
          ...run.models.map((model) => {
            const value = purposeOf(model, purpose)?.checks[name];
            return value === undefined ? "—" : pct(value);
          }),
        ]),
      );
    }
  }
  lines.push("");
  return lines;
}

export function renderBenchReport(
  run: AggregatedRun,
  ratesByModelId: ReadonlyMap<string, ModelRates>,
  meta: {
    runId: string;
    startedAt: string;
    finishedAt: string;
    spentCny: number;
    stoppedOnBudget: boolean;
  },
): string {
  const lines: string[] = [
    `# 模型能力评测 ${meta.runId}`,
    "",
    `参考模型：${run.referenceModelId ?? "（无——本次没有跑参考模型，一致度列为空）"}`,
    `开始 ${meta.startedAt} · 结束 ${meta.finishedAt} · 记账 ¥${meta.spentCny.toFixed(4)}` +
      (meta.stoppedOnBudget ? " · **预算用尽，后续调用未发起**" : ""),
    "",
    "schema 通过率 = 回复满足该用途真实 Zod schema 的比例（散文用途 = 回复非空）；",
    "首次通过 = 不靠 jsonClient 那一次纠错重试就通过。一致度是与参考模型的比法，按用途而定，",
    "不是对错。金标一致度（knowledge-edges / compare-align 的 goldAccuracy）不依赖参考模型。",
    "",
    "### 总览",
    "",
    ...header([
      "model",
      "calls",
      "schema 通过",
      "首次通过",
      "与参考一致",
      "p50 延迟",
      "p90 延迟",
      "每千次成本",
      "失败(schema/传输/空)",
    ]),
  ];
  for (const model of run.models) {
    const rates = ratesByModelId.get(model.modelId);
    const overall = model.overall;
    lines.push(
      row([
        model.isReference ? `${model.modelId} *(参考)*` : model.modelId,
        String(overall.calls),
        pct(overall.schemaPass),
        pct(overall.firstTryPass),
        model.isReference ? "—" : pct(overall.agreement),
        `${(overall.latencyP50Ms / 1000).toFixed(1)}s`,
        `${(overall.latencyP90Ms / 1000).toFixed(1)}s`,
        rates === undefined ? "—" : formatCost(overall.costPer1000Micros, rates.currency),
        `${overall.failures.schema}/${overall.failures.transport}/${overall.failures.empty}`,
      ]),
    );
  }
  lines.push("");
  lines.push(
    ...matrix(run, "schema 通过率（逐环节）", "免费小模型通常就崩在这一列。", (summary) =>
      summary === undefined || summary.calls === 0 ? "—" : pct(summary.schemaPass),
    ),
    ...matrix(
      run,
      "与参考模型一致度（逐环节）",
      "比法按用途而定：集合重合、序关系、逐项匹配。",
      (summary) => (summary === undefined ? "—" : pct(summary.agreement)),
    ),
    ...matrix(run, "p50 延迟（逐环节）", "包含传输重试与纠错重试在内的整次调用耗时。", (summary) =>
      summary === undefined || summary.calls === 0
        ? "—"
        : `${(summary.latencyP50Ms / 1000).toFixed(1)}s`,
    ),
    ...checkSections(run),
  );
  return `${lines.join("\n")}\n`;
}
