/**
 * Purpose: reads API keys from the process environment and the repo-root .env (hand-parsed
 * KEY=VALUE, no dotenv dependency — this is a one-line parse, not a job for a library) and
 * builds the shared LlmClientConfig the tutor/student calls and every pipeline stage reuse.
 * Main exports: loadEnvValue, loadDeepseekApiKey, buildLlmClientConfig, resolveRepoRoot,
 * DEEPSEEK_BASE_URL, DEEPSEEK_MODEL.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LlmClientConfig } from "@breadcrumb/core-llm";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
export const DEEPSEEK_MODEL = "deepseek-v4-flash";

/** packages/simlab/src/runner/config.ts -> repo root is four directories up. */
export function resolveRepoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
}

/**
 * Returns the value of one environment variable, or null when it is set nowhere — callers
 * must skip live-LLM work cleanly on null so `pnpm test` stays green without a key
 * configured. The real process environment wins over the repo-root .env, so a key can be
 * exported for one command without editing (or risking committing) a file.
 *
 * Values are never logged or echoed anywhere: this is the only place a key is read, and it
 * travels from here straight into an Authorization header.
 */
export function loadEnvValue(repoRoot: string, name: string): string | null {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess !== undefined && fromProcess.length > 0) return fromProcess;
  let content: string;
  try {
    content = readFileSync(join(repoRoot, ".env"), "utf-8");
  } catch {
    return null;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (key?.trim() !== name) continue;
    const value = rest.join("=").trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

/** The DeepSeek key every existing live eval reads. */
export function loadDeepseekApiKey(repoRoot: string): string | null {
  return loadEnvValue(repoRoot, "DEEPSEEK_API_KEY");
}

export function buildLlmClientConfig(apiKey: string): LlmClientConfig {
  return {
    baseUrl: DEEPSEEK_BASE_URL,
    apiKey,
    model: DEEPSEEK_MODEL,
    fetchImpl: globalThis.fetch,
  };
}
