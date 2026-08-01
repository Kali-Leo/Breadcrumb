/**
 * Purpose: unit tests for the repo-root .env parser and repo-root resolution.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildLlmClientConfig,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
  loadDeepseekApiKey,
  resolveRepoRoot,
} from "./config";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "breadcrumb-simlab-config-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("resolveRepoRoot", () => {
  it("resolves to the actual repo root (has a pnpm-workspace.yaml)", () => {
    expect(existsSync(join(resolveRepoRoot(), "pnpm-workspace.yaml"))).toBe(true);
  });
});

describe("loadDeepseekApiKey", () => {
  it("returns null when .env is absent", () => {
    expect(loadDeepseekApiKey(dir)).toBeNull();
  });

  it("returns null when the key is absent from .env", () => {
    writeFileSync(join(dir, ".env"), "OTHER_KEY=abc\n");
    expect(loadDeepseekApiKey(dir)).toBeNull();
  });

  it("parses the key from a KEY=VALUE line, ignoring comments and blank lines", () => {
    writeFileSync(
      join(dir, ".env"),
      "# a comment\n\nOTHER_KEY=nope\nDEEPSEEK_API_KEY=sk-test-123\nTRAILING=1\n",
    );
    expect(loadDeepseekApiKey(dir)).toBe("sk-test-123");
  });

  it("returns null for an empty value", () => {
    writeFileSync(join(dir, ".env"), "DEEPSEEK_API_KEY=\n");
    expect(loadDeepseekApiKey(dir)).toBeNull();
  });
});

describe("buildLlmClientConfig", () => {
  it("builds the deepseek config with the given key", () => {
    const config = buildLlmClientConfig("sk-abc");
    expect(config.apiKey).toBe("sk-abc");
    expect(config.baseUrl).toBe(DEEPSEEK_BASE_URL);
    expect(config.model).toBe(DEEPSEEK_MODEL);
    expect(config.fetchImpl).toBe(globalThis.fetch);
  });
});
