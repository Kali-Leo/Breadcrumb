/**
 * Purpose: reads DEEPSEEK_API_KEY from the repo-root .env (hand-parsed KEY=VALUE, no dotenv
 * dependency — this is a one-line parse, not a job for a library) and builds the shared
 * LlmClientConfig the tutor/student calls and every pipeline stage reuse.
 * Main exports: loadDeepseekApiKey, buildLlmClientConfig, resolveRepoRoot, DEEPSEEK_BASE_URL,
 * DEEPSEEK_MODEL.
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

/** Returns the key, or null if the .env file or the key is absent — callers must skip
 * live-LLM work cleanly on null so `pnpm test` stays green without an API key configured. */
export function loadDeepseekApiKey(repoRoot: string): string | null {
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
    if (key?.trim() !== "DEEPSEEK_API_KEY") continue;
    const value = rest.join("=").trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

export function buildLlmClientConfig(apiKey: string): LlmClientConfig {
  return {
    baseUrl: DEEPSEEK_BASE_URL,
    apiKey,
    model: DEEPSEEK_MODEL,
    fetchImpl: globalThis.fetch,
  };
}
