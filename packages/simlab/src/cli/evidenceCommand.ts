/**
 * Purpose: implements `sim evidence` — runs the retrieval-layer measurement (judges/
 * evidenceHitRate.ts) over the anchored items of data/gold-verdicts.json against the real
 * network, and writes artifacts/<runId>/evidence-hit-rate.json. No pass threshold: a
 * baseline measurement of how often each evidence layer brings back the sentence a claim
 * turns on.
 *
 * Flags: --queries llm|claim (default llm when DEEPSEEK_API_KEY is set, else claim),
 * --only id,id,… (a smoke run), --concurrency N (default 3), --limit N (items per query).
 * Keys come from the environment only: DEEPSEEK_API_KEY (repo-root .env or env) for the
 * extractor, BENCH_KEY_zhipu for the open-web layer; without the latter that layer is
 * reported as skipped rather than as missing.
 *
 * On a machine that reaches Wikimedia only through a proxy, Node needs
 * NODE_USE_ENV_PROXY=1 — and Zhipu may need the opposite (no_proxy=open.bigmodel.cn); the
 * two are measured separately here in that case.
 * Main exports: evidenceCommand.
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  EVIDENCE_LAYERS,
  type EvidenceHitRateOptions,
  runEvidenceHitRate,
} from "../judges/evidenceHitRate";
import { createRunArtifacts } from "../runner/artifacts";
import {
  buildLlmClientConfig,
  loadDeepseekApiKey,
  loadEnvValue,
  resolveRepoRoot,
} from "../runner/config";

interface EvidenceFlags {
  queries: "llm" | "claim" | null;
  only: string[] | null;
  concurrency: number;
  limit: number;
}

export function parseEvidenceFlags(argv: readonly string[]): EvidenceFlags {
  const flags: EvidenceFlags = { queries: null, only: null, concurrency: 3, limit: 3 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = () => {
      index += 1;
      return argv[index] ?? "";
    };
    switch (argv[index]) {
      case "--queries": {
        const mode = value();
        flags.queries = mode === "claim" ? "claim" : "llm";
        break;
      }
      case "--only":
        flags.only = value()
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0);
        break;
      case "--concurrency":
        flags.concurrency = Math.max(1, Number(value()) || 3);
        break;
      case "--limit":
        flags.limit = Math.max(1, Number(value()) || 3);
        break;
      default:
        break;
    }
  }
  return flags;
}

export async function evidenceCommand(argv: readonly string[]): Promise<void> {
  const flags = parseEvidenceFlags(argv);
  const repoRoot = resolveRepoRoot();
  const deepseekKey = loadDeepseekApiKey(repoRoot);
  const zhipuKey = loadEnvValue(repoRoot, "BENCH_KEY_zhipu") ?? undefined;
  const queries = flags.queries ?? (deepseekKey === null ? "claim" : "llm");
  if (queries === "llm" && deepseekKey === null) {
    console.error("simlab: --queries llm needs DEEPSEEK_API_KEY; use --queries claim instead.");
    process.exitCode = 1;
    return;
  }

  const runId = `evidence-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const artifacts = createRunArtifacts(join(repoRoot, "packages/simlab/artifacts"), runId);
  const options: EvidenceHitRateOptions = {
    queries,
    llmConfig: deepseekKey === null ? undefined : buildLlmClientConfig(deepseekKey),
    zhipuApiKey: zhipuKey,
    concurrency: flags.concurrency,
    limitPerQuery: flags.limit,
    onlyIds: flags.only ?? undefined,
    onItem: (done, total, id) => {
      if (done % 10 === 0 || done === total) console.log(`  ${done}/${total} (${id})`);
    },
  };

  console.log(
    `simlab evidence ${runId}: queries=${queries}, zhipu=${zhipuKey === undefined ? "skipped (no BENCH_KEY_zhipu)" : "on"}`,
  );
  const result = await runEvidenceHitRate(options);
  artifacts.writeJson("evidence-hit-rate.json", result);

  console.log(`\nanchored items: ${result.anchoredItems}`);
  for (const layer of EVIDENCE_LAYERS) {
    const summary = result.layers[layer];
    if (summary === "skipped") {
      console.log(`  ${layer.padEnd(10)} skipped`);
      continue;
    }
    console.log(
      `  ${layer.padEnd(10)} verbatim ${summary.hits}/${summary.attempted} (${(summary.hitRate * 100).toFixed(1)}%), ` +
        `value ${summary.valueHits}/${summary.attempted} (${(summary.valueHitRate * 100).toFixed(1)}%), ` +
        `failed ${summary.failed}, median ${summary.medianMs} ms`,
    );
  }
  console.log(
    `  any layer  verbatim ${(result.anyLayerHitRate * 100).toFixed(1)}%, value ${(result.anyLayerValueHitRate * 100).toFixed(1)}%`,
  );
  console.log("\nby language (verbatim(value)/attempted):");
  for (const [lang, row] of Object.entries(result.byLanguage)) {
    console.log(`  ${lang.padEnd(6)} ${EVIDENCE_LAYERS.map((l) => `${l}=${row[l]}`).join("  ")}`);
  }
  console.log("\nby claim type (verbatim(value)/attempted):");
  for (const [type, row] of Object.entries(result.byClaimType)) {
    console.log(`  ${type.padEnd(11)} ${EVIDENCE_LAYERS.map((l) => `${l}=${row[l]}`).join("  ")}`);
  }
  console.log(`\nartifacts: ${artifacts.dir}`);
}
