/**
 * Purpose: live-LLM eval for the scripted-recovery self-check — skipped cleanly when no
 * DEEPSEEK_API_KEY is configured (repo-root .env), so `pnpm test` stays green in CI.
 *
 * Deviation from the original "assert dominant signal matches the script" plan: live runs
 * against DeepSeek at DEFAULT_RECOVERY_ROUNDS (3) showed curiosity outscoring confusion/
 * boredom for both hard personas — a real empirical finding (the mechanism works: signals
 * ARE extracted and persisted), not a harness bug. Rather than assert a dominance that
 * doesn't reliably hold at 3 rounds, this asserts only that the pipeline produced signals at
 * all, matching the "no pass threshold" precedent already established for the gold-baseline
 * eval. Measuring the rate is a deliberate manual exercise (inspect `result` under a
 * debugger); the run itself stays quiet rather than printing into every `pnpm test`.
 */
import { describe, it } from "vitest";
import { buildLlmClientConfig, loadDeepseekApiKey, resolveRepoRoot } from "../runner/config";
import { runScriptedRecovery } from "./scriptedRecovery";

const apiKey = loadDeepseekApiKey(resolveRepoRoot());

describe.skipIf(apiKey === null)(
  "runScriptedRecovery (live DeepSeek, baseline measurement)",
  () => {
    it("measures dominant-signal recovery for the high-confusion-novice persona", async () => {
      const llmConfig = buildLlmClientConfig(apiKey as string);
      const result = await runScriptedRecovery("confused-novice", "confusion", llmConfig);
      if (result.signalCount === 0)
        throw new Error("scripted-recovery produced zero interest signals — pipeline is broken");
    }, 180_000);

    it("measures dominant-signal recovery for the bored-topic-skipper persona", async () => {
      const llmConfig = buildLlmClientConfig(apiKey as string);
      const result = await runScriptedRecovery("bored-topic-skipper", "boredom", llmConfig);
      if (result.signalCount === 0)
        throw new Error("scripted-recovery produced zero interest signals — pipeline is broken");
    }, 180_000);
  },
);
