/**
 * Purpose: implements `sim recovery` — runs the scripted-recovery self-check (a hard-confused
 * and a hard-bored seed persona for a few real rounds each) and writes
 * artifacts/<runId>/recovery-result.json. On-demand only, not part of `sim run`.
 * Main exports: recoveryCommand.
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { runScriptedRecovery } from "../judges/scriptedRecovery";
import { createRunArtifacts } from "../runner/artifacts";
import { buildLlmClientConfig, loadDeepseekApiKey, resolveRepoRoot } from "../runner/config";

export async function recoveryCommand(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const apiKey = loadDeepseekApiKey(repoRoot);
  if (apiKey === null) {
    console.error(
      "simlab: DEEPSEEK_API_KEY not found in repo-root .env — cannot run `sim recovery`.",
    );
    process.exitCode = 1;
    return;
  }

  const runId = `recovery-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const artifacts = createRunArtifacts(join(repoRoot, "packages/simlab/artifacts"), runId);
  const llmConfig = buildLlmClientConfig(apiKey);

  console.log(`simlab recovery ${runId}: running scripted-recovery personas...`);
  const [confusion, boredom] = await Promise.all([
    runScriptedRecovery("confused-novice", "confusion", llmConfig),
    runScriptedRecovery("bored-topic-skipper", "boredom", llmConfig),
  ]);
  artifacts.writeJson("recovery-result.json", { confusion, boredom });

  console.log(
    `  confused-novice: dominant=${confusion.dominantSignal}, matches=${confusion.matches}`,
  );
  console.log(
    `  bored-topic-skipper: dominant=${boredom.dominantSignal}, matches=${boredom.matches}`,
  );
  console.log(`artifacts: ${artifacts.dir}`);
}
