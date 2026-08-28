/**
 * Purpose: the fact-check pipeline — extract claims from one chat round, gather evidence
 * from providers in priority order, judge each claim, and report summed token usage.
 * Main exports: runFactCheck, FactCheckDeps, FactCheckReport, CheckedClaim.
 */
import {
  ChatJsonError,
  type ChatMessage,
  chatJson,
  type LlmClientConfig,
  type TokenUsage,
} from "@breadcrumb/core-llm";
import type { EvidenceItem, EvidenceProvider } from "./evidence/provider";
import { buildClaimExtractionMessages, claimExtractionSchema } from "./extraction";
import { gatherEvidence } from "./gathering";
import { seededShuffle } from "./shuffle";
import { buildVerdictMessages, type ClaimRelationship, createVerdictSchema } from "./verdict";

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
  /**
   * The judge's own sentence, in the answer's language — and the empty string whenever the
   * pipeline rather than the judge decided this claim, because a headless package holds no
   * wording (spec 058 §2). The app writes those sentences from its catalogue; `relationship`
   * plus whether any evidence is in hand tells the three cases apart, so no extra field is
   * needed: `unavailable` = the search never got out; `insufficient` with no evidence = the
   * search completed and found nothing; `insufficient` with evidence = the judging call
   * itself failed. The judge's own reasoning is never empty (the schema demands min(1)).
   */
  reasoning: string;
  /** Ordered cited-first — the links the judge actually leaned on come before the rest. */
  evidence: EvidenceItem[];
}

export interface FactCheckReport {
  claims: CheckedClaim[];
  usage: TokenUsage;
  /** Evidence providers that failed at least once during this run. The headless package has
   * no DB; the host records these in ai_failures (spec 014). */
  failedProviders: string[];
}

export async function runFactCheck(
  deps: FactCheckDeps,
  userQuestion: string,
  assistantAnswer: string,
): Promise<FactCheckReport> {
  const maxEvidence = deps.maxEvidencePerClaim ?? 3;
  const usages: TokenUsage[] = [];
  const failedProviders = new Set<string>();

  const extraction = await chatJson(
    deps.llmConfig,
    buildClaimExtractionMessages(userQuestion, assistantAnswer),
    claimExtractionSchema,
  );
  usages.push(extraction.usage);

  const claims: CheckedClaim[] = [];
  for (const claim of extraction.parsed.claims) {
    const gathered = await gatherEvidence(deps.providers, claim.queries, maxEvidence);
    for (const name of gathered.failedProviders) failedProviders.add(name);
    if (gathered.items.length === 0) {
      claims.push(emptyEvidenceClaim(claim.text, gathered.searchFailed));
      continue;
    }
    // Shuffled before judging, seeded by the claim so a re-run of the same claim gets the
    // same order: the judge's position bias must not track provider priority.
    const evidence = seededShuffle(gathered.items, claim.text);
    claims.push(await judgeClaim(deps.llmConfig, claim.text, evidence, usages));
  }

  return { claims, usage: sumUsages(usages), failedProviders: [...failedProviders] };
}

/** No evidence in hand — either the search came back empty, or it never came back at all.
 * No judge spoke here, so no reasoning is written: the app says it in the reader's language. */
function emptyEvidenceClaim(text: string, searchFailed: boolean): CheckedClaim {
  return {
    text,
    relationship: searchFailed ? "unavailable" : "insufficient",
    reasoning: "",
    evidence: [],
  };
}

/** Cited evidence first (in the judge's own citation order), everything else after. */
function citedFirst(
  evidence: readonly EvidenceItem[],
  supporting: readonly number[],
): EvidenceItem[] {
  const cited: EvidenceItem[] = [];
  const takenIndices = new Set<number>();
  for (const oneBasedIndex of supporting) {
    const item = evidence[oneBasedIndex - 1];
    if (item !== undefined && !takenIndices.has(oneBasedIndex)) {
      takenIndices.add(oneBasedIndex);
      cited.push(item);
    }
  }
  const rest = evidence.filter((_item, index) => !takenIndices.has(index + 1));
  return [...cited, ...rest];
}

async function judgeClaim(
  llmConfig: LlmClientConfig,
  claimText: string,
  evidence: EvidenceItem[],
  usages: TokenUsage[],
): Promise<CheckedClaim> {
  const messages: ChatMessage[] = buildVerdictMessages(claimText, evidence);
  try {
    const verdict = await chatJson(llmConfig, messages, createVerdictSchema(evidence.length));
    usages.push(verdict.usage);
    return {
      text: claimText,
      relationship: verdict.parsed.relationship,
      reasoning: verdict.parsed.reasoning,
      evidence: citedFirst(evidence, verdict.parsed.supportingEvidence),
    };
  } catch (error) {
    // The provider billed us for every attempt that reached it, including the ones we then
    // rejected — dropping that usage would under-state the user's spend (宪法原则 2).
    if (error instanceof ChatJsonError) usages.push(error.usage);
    // Evidence in hand but no reasoning: the app reads that pair as "the judging call did
    // not finish" and writes the sentence itself.
    return { text: claimText, relationship: "insufficient", reasoning: "", evidence };
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
