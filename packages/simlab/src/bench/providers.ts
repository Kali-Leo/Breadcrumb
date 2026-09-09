/**
 * Purpose: the candidate roster, read from an EXTERNAL machine-readable provider catalogue
 * rather than hardcoded here — endpoints, model ids, published prices and per-provider quirks
 * all live in that file, which is maintained (and re-verified) outside this repository.
 *
 * How to run with keys, which never enter this repository (宪法红线 — 密钥绝不入库):
 *
 *   set -a; . /path/to/llm-providers/keys.env; set +a
 *   export BENCH_PROVIDERS=/path/to/llm-providers/providers.json
 *   NODE_USE_ENV_PROXY=1 pnpm --filter @breadcrumb/simlab sim bench
 *
 * NODE_USE_ENV_PROXY only matters where a proxy is needed: Node's fetch ignores HTTPS_PROXY
 * unless started with it, and at least one candidate is unreachable from the mainland without
 * one — every call to it times out and reads as the model failing.
 *
 * Keys are read ONLY from `BENCH_KEY_<id>` in the environment (plus the repo's own
 * DEEPSEEK_API_KEY, which already exists for the other live evals). No key file path is
 * defaulted, read or written anywhere in this package. With BENCH_PROVIDERS unset the roster
 * is empty and every model reports as skipped, which is what keeps `pnpm test` green.
 *
 * The per-provider quirks and prices live next door in providerQuirks.ts — measured facts
 * about a provider's behaviour, not roster logic — and are re-exported here so the bench keeps
 * one import path for "everything about the candidates".
 * Main exports: loadProviderCatalogue, resolveBenchModels, benchRatesFor, BenchModel,
 * ResolvedBenchModel, BenchRoster, BENCH_PROVIDER_IDS, REFERENCE_MODEL_ID,
 * requiresLeadingSystem, concurrencyCapFor.
 */
import { readFileSync } from "node:fs";
import type { LlmClientConfig } from "@breadcrumb/core-llm";
import { z } from "zod";
import { loadEnvValue } from "../runner/config";

/** Environment variable naming the catalogue file. Unset = nothing to call. */
export const PROVIDERS_PATH_ENV = "BENCH_PROVIDERS";

const providerSchema = z.object({
  label: z.string().min(1),
  /** Full chat-completions URL. core-llm's completionsUrl leaves an already-complete one
   * alone, so the catalogue's own form is used verbatim instead of being re-derived. */
  url: z.string().url(),
  model: z.string().min(1),
  /** CNY per million tokens. */
  price: z.object({
    in: z.number().nonnegative(),
    cache_hit: z.number().nonnegative().nullable(),
    out: z.number().nonnegative(),
  }),
  reachable_in_cn: z.boolean(),
  quirks: z.array(z.string()).default([]),
});

const catalogueSchema = z.object({
  providers: z.record(z.string(), providerSchema),
});

export type ProviderEntry = z.infer<typeof providerSchema>;

/**
 * The providers this bench measures. Kimi is in the upstream catalogue and deliberately not
 * here: its free tier is capped at 3 requests per minute, so a several-hundred-call suite
 * would take days and measure the rate limiter.
 */
export const BENCH_PROVIDER_IDS: readonly string[] = [
  "deepseek",
  "dashscope",
  "zhipu",
  "siliconflow",
  "gemini",
  "ark",
];

/**
 * Extra model ids to measure on a provider whose catalogue entry names only one. These are
 * model names, not endpoints: the URL, the price row and the quirks still come from the
 * catalogue entry. deepseek-v4-pro is the reference; the second Qwen is the smaller sibling,
 * which is where a size cliff would show up if there is one.
 */
const EXTRA_MODELS: Readonly<Record<string, readonly string[]>> = {
  deepseek: ["deepseek-v4-pro"],
  siliconflow: ["Qwen/Qwen3.5-4B"],
};

/** The stronger model every candidate is compared against — a reference, not a truth. */
export const REFERENCE_MODEL_ID = "deepseek:deepseek-v4-pro";

export interface BenchModel {
  /** "<provider>:<model>" — the key every result row and report column is keyed by. */
  id: string;
  providerId: string;
  provider: ProviderEntry;
  model: string;
}

export interface ResolvedBenchModel extends BenchModel {
  config: Omit<LlmClientConfig, "fetchImpl">;
}

export interface BenchRoster {
  available: ResolvedBenchModel[];
  /** Why each absent model is absent, in the report's words. */
  skipped: { modelId: string; reason: string }[];
}

/** Reads and validates the catalogue named by BENCH_PROVIDERS. Null when the variable is
 * unset or the file cannot be read — an absent catalogue is a reportable fact, not a crash. */
export function loadProviderCatalogue(path?: string): Record<string, ProviderEntry> | null {
  const resolved = path ?? process.env[PROVIDERS_PATH_ENV];
  if (resolved === undefined || resolved.trim().length === 0) return null;
  let raw: string;
  try {
    raw = readFileSync(resolved.trim(), "utf-8");
  } catch {
    return null;
  }
  return catalogueSchema.parse(JSON.parse(raw)).providers;
}

/** Every model the catalogue offers for measurement, in BENCH_PROVIDER_IDS order. */
export function benchModels(catalogue: Record<string, ProviderEntry>): BenchModel[] {
  const models: BenchModel[] = [];
  for (const providerId of BENCH_PROVIDER_IDS) {
    const provider = catalogue[providerId];
    if (provider === undefined) continue;
    for (const model of [provider.model, ...(EXTRA_MODELS[providerId] ?? [])]) {
      models.push({ id: `${providerId}:${model}`, providerId, provider, model });
    }
  }
  return models;
}

/** The environment variables a provider's key may arrive in, in priority order. The lowercase
 * id is the upstream convention; the uppercase form and DeepSeek's existing repo variable are
 * accepted so nobody has to keep two spellings of the same secret. */
function keyEnvNames(providerId: string): string[] {
  const names = [`BENCH_KEY_${providerId}`, `BENCH_KEY_${providerId.toUpperCase()}`];
  if (providerId === "deepseek") names.push("DEEPSEEK_API_KEY");
  return names;
}

export function resolveBenchModels(
  repoRoot: string,
  catalogue: Record<string, ProviderEntry> | null,
): BenchRoster {
  if (catalogue === null) {
    return {
      available: [],
      skipped: [
        {
          modelId: "(all)",
          reason: `${PROVIDERS_PATH_ENV} is not set — no provider catalogue to read`,
        },
      ],
    };
  }
  const available: ResolvedBenchModel[] = [];
  const skipped: BenchRoster["skipped"] = [];
  const keyCache = new Map<string, string | null>();
  for (const entry of benchModels(catalogue)) {
    if (!keyCache.has(entry.providerId)) {
      const found = keyEnvNames(entry.providerId)
        .map((name) => loadEnvValue(repoRoot, name))
        .find((value) => value !== null);
      keyCache.set(entry.providerId, found ?? null);
    }
    const apiKey = keyCache.get(entry.providerId) ?? null;
    if (apiKey === null) {
      skipped.push({ modelId: entry.id, reason: `no key in BENCH_KEY_${entry.providerId}` });
      continue;
    }
    available.push({
      ...entry,
      config: { baseUrl: entry.provider.url, apiKey, model: entry.model },
    });
  }
  return { available, skipped };
}

export { benchRatesFor, concurrencyCapFor, requiresLeadingSystem } from "./providerQuirks";
