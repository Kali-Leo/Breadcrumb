/**
 * Purpose: the roster's contract — no catalogue means no models and no error, a model whose
 * key is absent is reported rather than skipped silently, and prices come from the right list
 * (core-llm's catalogue for a model it knows, the provider file for one it does not).
 *
 * No real key and no real catalogue path is used or defaulted anywhere in this file.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ratesForBenchModel } from "./costEstimate";
import { benchRatesFor, loadProviderCatalogue, resolveBenchModels } from "./providers";

const CATALOGUE = {
  providers: {
    deepseek: {
      label: "DeepSeek",
      url: "https://api.deepseek.com/chat/completions",
      model: "deepseek-v4-flash",
      price: { in: 1.58, cache_hit: 0.05, out: 4.75 },
      reachable_in_cn: true,
      quirks: ["必须显式关思考"],
    },
    zhipu: {
      label: "智谱",
      url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      model: "glm-4-flash-250414",
      price: { in: 0, cache_hit: 0, out: 0 },
      reachable_in_cn: true,
      quirks: [],
    },
  },
};

function writeCatalogue(): string {
  const dir = mkdtempSync(join(tmpdir(), "bench-providers-"));
  const path = join(dir, "providers.json");
  writeFileSync(path, JSON.stringify(CATALOGUE));
  return path;
}

/** A repo root with no .env, so only the process environment can supply a key. */
const EMPTY_ROOT = mkdtempSync(join(tmpdir(), "bench-root-"));

describe("loadProviderCatalogue", () => {
  it("returns null when the variable is unset or the file is missing", () => {
    expect(loadProviderCatalogue("")).toBeNull();
    expect(loadProviderCatalogue(join(EMPTY_ROOT, "nope.json"))).toBeNull();
  });

  it("validates and returns the providers it knows", () => {
    const catalogue = loadProviderCatalogue(writeCatalogue());
    expect(catalogue?.deepseek?.model).toBe("deepseek-v4-flash");
  });
});

describe("resolveBenchModels", () => {
  it("skips everything, with a reason, when there is no catalogue", () => {
    const roster = resolveBenchModels(EMPTY_ROOT, null);
    expect(roster.available).toHaveLength(0);
    expect(roster.skipped[0]?.reason).toContain("BENCH_PROVIDERS");
  });

  it("names the missing variable for a provider with no key", () => {
    const roster = resolveBenchModels(EMPTY_ROOT, loadProviderCatalogue(writeCatalogue()));
    expect(roster.available).toHaveLength(0);
    expect(roster.skipped.map((entry) => entry.reason)).toContain("no key in BENCH_KEY_zhipu");
  });

  it("resolves a provider whose key is in the environment, and adds its extra models", () => {
    process.env.BENCH_KEY_deepseek = "not-a-real-key";
    try {
      const roster = resolveBenchModels(EMPTY_ROOT, loadProviderCatalogue(writeCatalogue()));
      expect(roster.available.map((model) => model.id)).toEqual([
        "deepseek:deepseek-v4-flash",
        "deepseek:deepseek-v4-pro",
      ]);
      expect(roster.available[0]?.config.baseUrl).toBe("https://api.deepseek.com/chat/completions");
    } finally {
      delete process.env.BENCH_KEY_deepseek;
    }
  });
});

describe("pricing", () => {
  it("reads a free tier as free rather than as unpriced", () => {
    const catalogue = loadProviderCatalogue(writeCatalogue());
    const zhipu = catalogue?.zhipu;
    if (zhipu === undefined) throw new Error("catalogue missing zhipu");
    const rates = benchRatesFor({
      id: "zhipu:x",
      providerId: "zhipu",
      provider: zhipu,
      model: "glm-4-flash-250414",
    });
    expect(rates).toEqual({
      currency: "CNY",
      inputPerMillionTokens: 0,
      cachedInputPerMillionTokens: 0,
      outputPerMillionTokens: 0,
    });
  });

  it("prefers core-llm's catalogue for a model it already prices", () => {
    const catalogue = loadProviderCatalogue(writeCatalogue());
    const deepseek = catalogue?.deepseek;
    if (deepseek === undefined) throw new Error("catalogue missing deepseek");
    const rates = ratesForBenchModel({
      id: "deepseek:deepseek-v4-flash",
      providerId: "deepseek",
      provider: deepseek,
      model: "deepseek-v4-flash",
    });
    // The catalogue's peak rate is 3 CNY/M and off-peak halves it; the provider file's flat
    // 1.58 is neither, so seeing one of the two proves which list won.
    expect([3, 1.5]).toContain(rates.inputPerMillionTokens);
  });
});
