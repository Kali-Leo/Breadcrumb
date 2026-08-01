/**
 * Purpose: implements `sim gold` — runs the gold-standard prerequisite baseline against
 * every pair in data/gold-prerequisites.json and writes artifacts/<runId>/gold-baseline.json.
 * No pass threshold: baseline measurement only.
 * Main exports: goldCommand.
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { runGoldBaseline } from "../judges/goldBaseline";
import { createRunArtifacts } from "../runner/artifacts";
import { buildLlmClientConfig, loadDeepseekApiKey, resolveRepoRoot } from "../runner/config";

export async function goldCommand(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const apiKey = loadDeepseekApiKey(repoRoot);
  if (apiKey === null) {
    console.error("simlab: DEEPSEEK_API_KEY not found in repo-root .env — cannot run `sim gold`.");
    process.exitCode = 1;
    return;
  }

  const runId = `gold-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const artifacts = createRunArtifacts(join(repoRoot, "packages/simlab/artifacts"), runId);
  const llmConfig = buildLlmClientConfig(apiKey);

  console.log(`simlab gold ${runId}: judging every gold-prerequisites.json pair...`);
  const result = await runGoldBaseline(llmConfig);
  artifacts.writeJson("gold-baseline.json", result);

  console.log(
    `simlab gold ${runId} done: direction accuracy ${(result.directionAccuracy * 100).toFixed(1)}%, ` +
      `unrelated-rejection rate ${(result.unrelatedRejectionRate * 100).toFixed(1)}% ` +
      `(${result.requiresCount} requires pairs, ${result.unrelatedCount} unrelated pairs)`,
  );
  console.log(`artifacts: ${artifacts.dir}`);
}
