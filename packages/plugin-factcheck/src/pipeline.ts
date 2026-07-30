/**
 * Purpose: the fact-check pipeline — extract claims from one chat round, gather evidence
 * from providers in priority order, judge each claim, and report summed token usage.
 * Main exports: runFactCheck, FactCheckDeps, FactCheckReport, CheckedClaim.
 */
import {
  type ChatMessage,
  chatJson,
  type LlmClientConfig,
  type TokenUsage,
} from "@breadcrumb/core-llm";
import type { EvidenceItem, EvidenceProvider } from "./evidence/provider";
import { buildClaimExtractionMessages, claimExtractionSchema } from "./extraction";
import { buildVerdictMessages, type ClaimRelationship, verdictSchema } from "./verdict";

export interface FactCheckDeps {
  llmConfig: LlmClientConfig;
  /** Tried in order per query until enough evidence is gathered. */
  providers: readonly EvidenceProvider[];
  /** Evidence items gathered per claim before judging (default 3). */
  maxEvidencePerClaim?: number;
}

export interface CheckedClaim {
  text: string;
  relationship: ClaimRelationship;
  reasoning: string;
  evidence: EvidenceItem[];
}

export interface FactCheckReport {
  claims: CheckedClaim[];
  usage: TokenUsage;
}

const NO_EVIDENCE_REASONING = "我没有找到能佐证这一条的公开资料，值得再确认一下。";
const VERDICT_FAILED_REASONING = "核查中途遇到了网络波动，这一条暂时没能完成判定。";

export async function runFactCheck(
  deps: FactCheckDeps,
  userQuestion: string,
  assistantAnswer: string,
): Promise<FactCheckReport> {
  const maxEvidence = deps.maxEvidencePerClaim ?? 3;
  const usages: TokenUsage[] = [];

  const extraction = await chatJson(
    deps.llmConfig,
    buildClaimExtractionMessages(userQuestion, assistantAnswer),
    claimExtractionSchema,
  );
  usages.push(extraction.usage);

  const claims: CheckedClaim[] = [];
  for (const claim of extraction.parsed.claims) {
    const evidence = await gatherEvidence(deps.providers, claim.queries, maxEvidence);
    if (evidence.length === 0) {
      claims.push({
        text: claim.text,
        relationship: "insufficient",
        reasoning: NO_EVIDENCE_REASONING,
        evidence: [],
      });
      continue;
    }
    claims.push(await judgeClaim(deps.llmConfig, claim.text, evidence, usages));
  }

  return { claims, usage: sumUsages(usages) };
}

async function gatherEvidence(
  providers: readonly EvidenceProvider[],
  queries: readonly string[],
  maxEvidence: number,
): Promise<EvidenceItem[]> {
  const evidence: EvidenceItem[] = [];
  const seenUrls = new Set<string>();
  for (const query of queries) {
    for (const provider of providers) {
      if (evidence.length >= maxEvidence) return evidence;
      const items = await provider.search(query, maxEvidence - evidence.length);
      for (const item of items) {
        if (!seenUrls.has(item.url) && evidence.length < maxEvidence) {
          seenUrls.add(item.url);
          evidence.push(item);
        }
      }
    }
  }
  return evidence;
}

async function judgeClaim(
  llmConfig: LlmClientConfig,
  claimText: string,
  evidence: EvidenceItem[],
  usages: TokenUsage[],
): Promise<CheckedClaim> {
  const messages: ChatMessage[] = buildVerdictMessages(claimText, evidence);
  try {
    const verdict = await chatJson(llmConfig, messages, verdictSchema);
    usages.push(verdict.usage);
    return {
      text: claimText,
      relationship: verdict.parsed.relationship,
      reasoning: verdict.parsed.reasoning,
      evidence,
    };
  } catch {
    return {
      text: claimText,
      relationship: "insufficient",
      reasoning: VERDICT_FAILED_REASONING,
      evidence,
    };
  }
}

function sumUsages(usages: readonly TokenUsage[]): TokenUsage {
  return usages.reduce(
    (total, usage) => ({
      inputTokens: total.inputTokens + usage.inputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
    }),
    { inputTokens: 0, outputTokens: 0 },
  );
}
