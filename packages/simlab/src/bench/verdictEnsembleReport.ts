/**
 * Purpose: renders the hardening comparison as the one table the decision is made from — every
 * prompt shape × every voting rule, with the false-support column first because that is the
 * failure this product is most afraid of and accuracy is only the tie-breaker.
 *
 * The over-caution column is here on purpose: a configuration that abstains its way to a zero
 * false-support rate has bought that zero with real citations the learner never saw, and a
 * table that hid that price would recommend saying nothing at all.
 * Main exports: renderEnsembleReport.
 */
import type { EnsembleRow } from "./verdictEnsemble";

function pct(value: number | undefined): string {
  return value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;
}

function missedSupport(row: EnsembleRow): string {
  const recall = row.checks.supportRecall;
  return recall === undefined ? "—" : pct(1 - recall);
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function row(cells: readonly string[]): string {
  return `| ${cells.join(" | ")} |`;
}

const HEADINGS: readonly string[] = [
  "配置",
  "调用/条",
  "假阳性↓",
  "困难假阳性↓",
  "准确率",
  "弃答率",
  "弃答精确",
  "弃答召回",
  "漏掉正确佐证",
  "p50 串行",
  "p50 并行",
];

function bodyRow(entry: EnsembleRow): string {
  return row([
    entry.config,
    String(entry.callsPerClaim),
    pct(entry.checks.falseSupportRate),
    pct(entry.checks.hardFalseSupportRate),
    pct(entry.checks.verdictAccuracy),
    pct(entry.checks.abstentionRate),
    pct(entry.checks.abstentionPrecision),
    pct(entry.checks.abstentionRecall),
    missedSupport(entry),
    seconds(entry.latencySequentialP50Ms),
    seconds(entry.latencyParallelP50Ms),
  ]);
}

/** The per-purpose quote columns: only a quote configuration reports them, and they are what
 * says whether the gate is doing mechanical work or the prompt alone did it. */
function quoteLines(rows: readonly EnsembleRow[]): string[] {
  const single = rows.filter((entry) => entry.rule === "single");
  const withQuote = single.filter((entry) => entry.checks.quoteGrounded !== undefined);
  if (withQuote.length === 0) return [];
  const lines = [
    "",
    "锚点校验（仅单模型行，逐字子串命中率与被闸门拦下的比例）：",
    "",
    row([
      "模型",
      "quote 是原文",
      "quote 在所引资料内",
      "被闸门降级",
      "闸门前准确率",
      "闸门前假阳性",
    ]),
    row(new Array(6).fill("---")),
  ];
  for (const entry of withQuote) {
    lines.push(
      row([
        entry.config,
        pct(entry.checks.quoteGrounded),
        pct(entry.checks.quoteInCited),
        pct(entry.checks.gateDowngrade),
        pct(entry.checks.rawVerdictAccuracy),
        pct(entry.checks.rawFalseSupportRate),
      ]),
    );
  }
  return lines;
}

export function renderEnsembleReport(rows: readonly EnsembleRow[], runId: string): string {
  const purposes = [...new Set(rows.map((entry) => entry.purpose))];
  const lines = [
    `# 判定器加固对照 ${runId}`,
    "",
    "首要指标是假阳性率（金标不是 supported 却被判成 supported），其次准确率；弃答率上升是",
    "可接受代价，但「漏掉正确佐证」列出了这个代价的大小（金标 supported 却没被认出的比例）。",
    "投票配置不产生新的调用成本：同一次运行里每个模型都已经答过每一条。",
    "",
  ];
  for (const purpose of purposes) {
    const forPurpose = rows.filter((entry) => entry.purpose === purpose);
    lines.push(`## ${purpose}`, "");
    const first = forPurpose[0];
    if (first !== undefined) lines.push(`金标条目 ${first.items} 条。`, "");
    lines.push(row(HEADINGS), row(HEADINGS.map(() => "---")));
    for (const entry of forPurpose) lines.push(bodyRow(entry));
    const missing = forPurpose.filter((entry) => entry.missingVotes > 0);
    if (missing.length > 0) {
      lines.push(
        "",
        `缺票（调用失败或回复不合 schema，一律按 insufficient 计）：${missing
          .map((entry) => `${entry.config} ${entry.missingVotes}`)
          .join("、")}`,
      );
    }
    lines.push(...quoteLines(forPurpose), "");
  }
  return lines.join("\n");
}
