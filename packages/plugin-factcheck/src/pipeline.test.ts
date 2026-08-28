/**
 * Purpose: unit tests for the fact-check pipeline — end-to-end with mocked LLM and
 * providers: verdicts, evidence-less claims, the unavailable state when retrieval itself
 * failed, the empty reasoning every pipeline-decided outcome carries (the app writes those
 * sentences), citation-first ordering, usage summing (including failed calls), and call
 * counting.
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

function makeProvider(items: EvidenceItem[], name = "stub"): EvidenceProvider {
  return { name, search: vi.fn(async () => ({ items, failed: false })) };
}

function makeFailingProvider(name = "stub"): EvidenceProvider {
  return { name, search: vi.fn(async () => ({ items: [], failed: true })) };
}

describe("runFactCheck", () => {
  it("judges a claim with evidence and sums usage across calls", async () => {
    const fetchImpl = createLlmFetch(
      { claims: [{ text: "光速约为每秒 30 万公里", queries: ["光速"] }] },
      { reasoning: "资料显示数值一致。", relationship: "supported", supportingEvidence: [1] },
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
    expect(report.failedProviders).toEqual([]);
  });

  it("puts the evidence the judge cited ahead of the evidence it did not", async () => {
    const items: EvidenceItem[] = [
      { ...EVIDENCE_ITEM, url: "https://a.test", title: "A" },
      { ...EVIDENCE_ITEM, url: "https://b.test", title: "B" },
      { ...EVIDENCE_ITEM, url: "https://c.test", title: "C" },
    ];
    // Whatever order the shuffle produced, the judge's own citation decides what comes
    // first — the user's first click must land on a page that actually mentions the claim.
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const body = String(init?.body ?? "");
      if (body.includes("核查前哨")) {
        return llmResponse({ claims: [{ text: "某声明", queries: ["q"] }] });
      }
      const shownSecond = /\[2\]（wikipedia）(\w)/.exec(JSON.parse(body).messages[1].content)?.[1];
      return llmResponse({
        reasoning: `资料显示 ${shownSecond} 相关。`,
        relationship: "supported",
        supportingEvidence: [2],
      });
    });
    const report = await runFactCheck(
      { llmConfig: makeConfig(fetchImpl), providers: [makeProvider(items)] },
      "问",
      "答",
    );

    const cited = /资料显示 (\w) 相关。/.exec(report.claims[0]?.reasoning ?? "")?.[1];
    expect(report.claims[0]?.evidence[0]?.title).toBe(cited);
    expect(report.claims[0]?.evidence).toHaveLength(3);
  });

  it("orders evidence deterministically for the same claim", async () => {
    const items: EvidenceItem[] = [
      { ...EVIDENCE_ITEM, url: "https://a.test", title: "A" },
      { ...EVIDENCE_ITEM, url: "https://b.test", title: "B" },
      { ...EVIDENCE_ITEM, url: "https://c.test", title: "C" },
    ];
    const run = async () => {
      const fetchImpl = createLlmFetch(
        { claims: [{ text: "同一条声明", queries: ["q"] }] },
        { reasoning: "资料显示。", relationship: "insufficient", supportingEvidence: [] },
      );
      const report = await runFactCheck(
        { llmConfig: makeConfig(fetchImpl), providers: [makeProvider(items)] },
        "问",
        "答",
      );
      return report.claims[0]?.evidence.map((item) => item.title);
    };

    expect(await run()).toEqual(await run());
  });

  it("marks a claim insufficient without calling the verdict LLM when a search finds nothing", async () => {
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
    // No judge spoke, so the package writes no sentence: a headless package holds no
    // wording, and a hardcoded Chinese one reached English readers verbatim (spec 058 §2).
    expect(report.claims[0]?.reasoning).toBe("");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("marks a claim unavailable — never insufficient — when every provider failed", async () => {
    // "我这次没查成" must never be rendered as "公开资料里没有" (审计差距 2).
    const fetchImpl = createLlmFetch(
      { claims: [{ text: "某条本可核查的声明", queries: ["查询"] }] },
      { reasoning: "不应被调用", relationship: "supported" },
    );
    const report = await runFactCheck(
      {
        llmConfig: makeConfig(fetchImpl),
        providers: [makeFailingProvider("bing"), makeFailingProvider("duckduckgo")],
      },
      "问",
      "答",
    );

    expect(report.claims[0]?.relationship).toBe("unavailable");
    expect(report.claims[0]?.reasoning).toBe("");
    expect(report.failedProviders).toEqual(["bing", "duckduckgo"]);
  });

  it("stays insufficient when one provider failed but another answered emptily", async () => {
    const fetchImpl = createLlmFetch(
      { claims: [{ text: "某条声明", queries: ["查询"] }] },
      { reasoning: "不应被调用", relationship: "supported" },
    );
    const report = await runFactCheck(
      {
        llmConfig: makeConfig(fetchImpl),
        providers: [makeFailingProvider("bing"), makeProvider([], "duckduckgo")],
      },
      "问",
      "答",
    );

    expect(report.claims[0]?.relationship).toBe("insufficient");
    expect(report.failedProviders).toEqual(["bing"]);
  });

  it("leaves reasoning to the judge whenever the judge actually answered", async () => {
    const fetchImpl = createLlmFetch(
      { claims: [{ text: "某条声明", queries: ["查询"] }] },
      { reasoning: "资料显示数值一致。", relationship: "supported", supportingEvidence: [1] },
    );
    const report = await runFactCheck(
      { llmConfig: makeConfig(fetchImpl), providers: [makeProvider([EVIDENCE_ITEM])] },
      "问",
      "答",
    );

    expect(report.claims[0]?.reasoning).toBe("资料显示数值一致。");
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
    // Evidence in hand plus empty reasoning is exactly how the app tells "the judging call
    // failed" apart from "the search found nothing" — no marker field needed.
    expect(report.claims[0]?.reasoning).toBe("");
  });

  it("still bills the tokens a rejected verdict call already cost", async () => {
    // The provider answered and charged for it; the reply just failed our schema. Dropping
    // that usage would under-state the user's spend (宪法原则 2).
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const body = String(init?.body ?? "");
      if (body.includes("核查前哨")) {
        return llmResponse({ claims: [{ text: "某条声明", queries: ["查询"] }] });
      }
      return llmResponse({ reasoning: "缺字段", relationship: "not-a-relationship" });
    });
    const report = await runFactCheck(
      { llmConfig: makeConfig(fetchImpl), providers: [makeProvider([EVIDENCE_ITEM])] },
      "问",
      "答",
    );

    expect(report.claims[0]?.relationship).toBe("insufficient");
    // Extraction (10/5) + the verdict's first attempt and its one correction (2 × 10/5).
    expect(report.usage).toEqual({ inputTokens: 30, outputTokens: 15 });
  });
});
