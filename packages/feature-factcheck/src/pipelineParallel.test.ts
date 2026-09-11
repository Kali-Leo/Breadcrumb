/**
 * Purpose: what changed when the claim loop stopped being a loop. Four independent claims now
 * search at once and are judged under a ceiling, so these cover the three properties that must
 * survive that: the report still comes back in the extraction's order, no more verdict calls are
 * ever in flight than the ceiling allows (a free-tier key is metered per minute), and the stage
 * callback the UI shows its "正在核对" line from fires once per stage, in order.
 */
import type { LlmClientConfig } from "@breadcrumb/core-llm";
import { describe, expect, it, vi } from "vitest";
import type { EvidenceItem, EvidenceProvider } from "./evidence/provider";
import { type FactCheckStage, runFactCheck } from "./pipeline";

const SNIPPET = "光速是每秒 299792458 米。";
const GROUNDED_QUOTE = "光速是每秒 299792458 米";

function evidenceFor(claimText: string): EvidenceItem {
  return {
    url: `https://source.test/${encodeURIComponent(claimText)}`,
    title: `关于${claimText}的资料`,
    snippet: SNIPPET,
    source: "wikipedia",
  };
}

const CLAIMS = ["声明一", "声明二", "声明三", "声明四"];

function llmResponse(payload: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(payload) } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    { status: 200 },
  );
}

/** Resolves after a macrotask, so overlapping calls really do overlap. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

/** An LLM whose verdict calls are slow enough to observe, counting how many overlap. */
function createTrackingLlmFetch(): { fetchImpl: typeof fetch; peakInFlight: () => number } {
  let inFlight = 0;
  let peak = 0;
  const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
    const body = String(init?.body ?? "");
    if (body.includes("核查前哨")) {
      return llmResponse({ claims: CLAIMS.map((text) => ({ text, queries: [text] })) });
    }
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await tick();
    inFlight -= 1;
    // The claim is quoted into the prompt, so the verdict can name which one it answered.
    const claim = CLAIMS.find((text) => body.includes(text)) ?? "?";
    return llmResponse({
      reasoning: `资料显示${claim}成立。`,
      relationship: "supported",
      quote: GROUNDED_QUOTE,
      supportingEvidence: [1],
    });
  });
  return { fetchImpl, peakInFlight: () => peak };
}

function makeConfig(fetchImpl: typeof fetch): LlmClientConfig {
  return { baseUrl: "https://llm.test/v1", apiKey: "test-key", model: "test-model", fetchImpl };
}

/** A provider that takes a moment to answer and records how many searches overlapped. */
function makeSlowProvider(): { provider: EvidenceProvider; peakInFlight: () => number } {
  let inFlight = 0;
  let peak = 0;
  return {
    provider: {
      name: "slow",
      search: async (query: string) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await tick();
        inFlight -= 1;
        return { items: [evidenceFor(query)], failed: false };
      },
    },
    peakInFlight: () => peak,
  };
}

describe("runFactCheck over several claims at once", () => {
  it("returns the claims in the extraction's order, not in the order they finished", async () => {
    const { fetchImpl } = createTrackingLlmFetch();
    const { provider } = makeSlowProvider();
    const report = await runFactCheck(
      { llmConfig: makeConfig(fetchImpl), providers: [provider] },
      "问",
      "答",
    );

    expect(report.claims.map((claim) => claim.text)).toEqual(CLAIMS);
    expect(report.claims.every((claim) => claim.relationship === "supported")).toBe(true);
  });

  it("searches for every claim at the same time", async () => {
    // Searching costs no LLM quota, so this is the half that is allowed to go wide.
    const { fetchImpl } = createTrackingLlmFetch();
    const { provider, peakInFlight } = makeSlowProvider();
    await runFactCheck({ llmConfig: makeConfig(fetchImpl), providers: [provider] }, "问", "答");

    expect(peakInFlight()).toBe(CLAIMS.length);
  });

  it("never has more verdict calls in flight than the ceiling allows", async () => {
    const { fetchImpl, peakInFlight } = createTrackingLlmFetch();
    const { provider } = makeSlowProvider();
    await runFactCheck(
      { llmConfig: makeConfig(fetchImpl), providers: [provider], judgeConcurrency: 2 },
      "问",
      "答",
    );

    expect(peakInFlight()).toBe(2);
  });

  it("judges one at a time when asked to, for a provider that allows no concurrency", async () => {
    const { fetchImpl, peakInFlight } = createTrackingLlmFetch();
    const { provider } = makeSlowProvider();
    await runFactCheck(
      { llmConfig: makeConfig(fetchImpl), providers: [provider], judgeConcurrency: 1 },
      "问",
      "答",
    );

    expect(peakInFlight()).toBe(1);
  });

  it("announces each stage once, in order", async () => {
    const { fetchImpl } = createTrackingLlmFetch();
    const { provider } = makeSlowProvider();
    const stages: FactCheckStage[] = [];
    await runFactCheck(
      {
        llmConfig: makeConfig(fetchImpl),
        providers: [provider],
        onStage: (stage) => stages.push(stage),
      },
      "问",
      "答",
    );

    expect(stages).toEqual(["extracting", "gathering", "judging"]);
  });

  it("stops after extraction when the round holds nothing to check", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => llmResponse({ claims: [] }));
    const stages: FactCheckStage[] = [];
    const report = await runFactCheck(
      { llmConfig: makeConfig(fetchImpl), providers: [], onStage: (stage) => stages.push(stage) },
      "你好",
      "你好呀",
    );

    expect(report.claims).toEqual([]);
    expect(stages).toEqual(["extracting"]);
  });
});
