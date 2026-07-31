/**
 * Purpose: unit tests for the fact-check pipeline — end-to-end with mocked LLM and
 * providers: verdicts, evidence-less claims, usage summing, and call counting.
 */
import type { LlmClientConfig } from "@breadcrumb/core-llm";
import { describe, expect, it, vi } from "vitest";
import type { EvidenceItem, EvidenceProvider } from "./evidence/provider";
import { runFactCheck } from "./pipeline";

const EVIDENCE_ITEM: EvidenceItem = {
  url: "https://zh.wikipedia.org/wiki/光速",
  title: "光速",
  snippet: "光速是每秒 299792458 米。",
  source: "wikipedia",
};

function llmResponse(payload: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(payload) } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    { status: 200 },
  );
}

/** Routes mocked LLM calls: extraction prompt → claims, verdict prompt → verdict. */
function createLlmFetch(claims: unknown, verdict: unknown): typeof fetch {
  return vi.fn<typeof fetch>(async (_input, init) => {
    const body = String(init?.body ?? "");
    if (body.includes("核查前哨")) return llmResponse(claims);
    return llmResponse(verdict);
  });
}

function makeConfig(fetchImpl: typeof fetch): LlmClientConfig {
  return { baseUrl: "https://llm.test/v1", apiKey: "test-key", model: "test-model", fetchImpl };
}

function makeProvider(items: EvidenceItem[]): EvidenceProvider {
  return { name: "stub", search: vi.fn(async () => items) };
}

describe("runFactCheck", () => {
  it("judges a claim with evidence and sums usage across calls", async () => {
    const fetchImpl = createLlmFetch(
      { claims: [{ text: "光速约为每秒 30 万公里", queries: ["光速"] }] },
      { reasoning: "资料显示数值一致。", relationship: "supported" },
    );
    const report = await runFactCheck(
      { llmConfig: makeConfig(fetchImpl), providers: [makeProvider([EVIDENCE_ITEM])] },
      "什么是光速？",
      "光速约为每秒 30 万公里。",
    );

    expect(report.claims).toHaveLength(1);
    expect(report.claims[0]?.relationship).toBe("supported");
    expect(report.claims[0]?.evidence).toEqual([EVIDENCE_ITEM]);
    expect(report.usage).toEqual({ inputTokens: 20, outputTokens: 10 });
  });

  it("marks a claim insufficient without calling the verdict LLM when no evidence is found", async () => {
    const fetchImpl = createLlmFetch(
      { claims: [{ text: "某位不存在的学者提出过某理论", queries: ["不存在的学者"] }] },
      { reasoning: "不应被调用", relationship: "supported" },
    );
    const report = await runFactCheck(
      { llmConfig: makeConfig(fetchImpl), providers: [makeProvider([])] },
      "问",
      "答",
    );

    expect(report.claims[0]?.relationship).toBe("insufficient");
    expect(report.claims[0]?.evidence).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns no claims and only the extraction usage for a chit-chat round", async () => {
    const fetchImpl = createLlmFetch({ claims: [] }, {});
    const report = await runFactCheck(
      { llmConfig: makeConfig(fetchImpl), providers: [] },
      "你好",
      "你好呀",
    );

    expect(report.claims).toEqual([]);
    expect(report.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("degrades gently to insufficient when the verdict call fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const body = String(init?.body ?? "");
      if (body.includes("核查前哨")) {
        return llmResponse({ claims: [{ text: "光速约为每秒 30 万公里", queries: ["光速"] }] });
      }
      return new Response("error", { status: 500 });
    });
    const report = await runFactCheck(
      { llmConfig: makeConfig(fetchImpl), providers: [makeProvider([EVIDENCE_ITEM])] },
      "问",
      "答",
    );

    expect(report.claims[0]?.relationship).toBe("insufficient");
    expect(report.claims[0]?.evidence).toEqual([EVIDENCE_ITEM]);
  });
});
