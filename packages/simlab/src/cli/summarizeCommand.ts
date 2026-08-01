/**
 * Purpose: implements `sim summarize <runId>` — reads artifacts/<runId>/metrics.json and the
 * flagged/ directory, writes artifacts/<runId>/summary.md. Pure file I/O around
 * buildSummaryMarkdown; no LLM calls, no re-computed numbers (see that module's header).
 * Main exports: summarizeCommand.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunMetrics } from "../judges/metrics";
import { resolveRepoRoot } from "../runner/config";
import { buildSummaryMarkdown } from "./summaryMarkdown";

export async function summarizeCommand(argv: readonly string[]): Promise<void> {
  const runId = argv[0];
  if (runId === undefined) {
    console.error("simlab: usage: sim summarize <runId>");
    process.exitCode = 1;
    return;
  }

  const runDir = join(resolveRepoRoot(), "packages/simlab/artifacts", runId);
  const metricsPath = join(runDir, "metrics.json");
  if (!existsSync(metricsPath)) {
    console.error(`simlab: no metrics.json found for run "${runId}" at ${metricsPath}`);
    process.exitCode = 1;
    return;
  }

  const metrics = JSON.parse(readFileSync(metricsPath, "utf-8")) as RunMetrics;
  const flaggedDir = join(runDir, "flagged");
  const flaggedFileNames = existsSync(flaggedDir) ? readdirSync(flaggedDir).sort() : [];

  const markdown = buildSummaryMarkdown(metrics, flaggedFileNames);
  writeFileSync(join(runDir, "summary.md"), markdown);

  console.log(`simlab summarize: wrote ${join(runDir, "summary.md")}`);
}
