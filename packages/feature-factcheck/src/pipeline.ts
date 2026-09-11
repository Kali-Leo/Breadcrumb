/**
 * Purpose: the fact-check pipeline — extract claims from one chat round, gather evidence
 * from providers in priority order, judge each claim, and report summed token usage. The
 * claims of one round are independent of each other, so they are worked in parallel under two
 * different ceilings (see runFactCheck) rather than one after another.
 * Main exports: runFactCheck, FactCheckDeps, FactCheckReport, CheckedClaim, FactCheckStage.
 */
import { chatJson, type LlmClientConfig, type TokenUsage } from "@breadcrumb/core-llm";
import { mapWithConcurrency } from "./concurrency";
import type { EvidenceItem, EvidenceProvider } from "./evidence/provider";
import { buildClaimExtractionMessages, claimExtractionSchema } from "./extraction";
import { gatherEvidence } from "./gathering";
import { judgeClaim } from "./judging";
import { seededShuffle } from "./shuffle";
import type { ClaimRelationship } from "./verdict";

/**
 * How many verdict calls may be in flight at once. Two rather than four: a free-tier key is
 * metered in requests per minute (OpenRouter's free models publish 20 RPM), and a round that
 * fires every claim at once is the quickest way to spend a check's latency budget on 429
 * backoff instead of on judging. Two halves the worst case without approaching that ceiling.
 */
export const DEFAULT_JUDGE_CONCURRENCY = 2;

/** What the pipeline is doing right now, so the waiting can be shown as the work it is. */
export type FactCheckStage = "extracting" | "gathering" | "judging";

export interface FactCheckDeps {
  llmConfig: LlmClientConfig;
  /** Tried in order per query until enough evidence is gathered. */
  providers: readonly EvidenceProvider[];
  /** Evidence items gathered per claim before judging (default 3). */
  maxEvidencePerClaim?: number;
  /** Verdict calls in flight at once (default DEFAULT_JUDGE_CONCURRENCY). */
  judgeConcurrency?: number;
  /** Called as each stage begins. Never called after the report is returned. */
  onStage?: (stage: FactCheckStage) => void;
}

export interface CheckedClaim {
  text: string;
  relationship: ClaimRelationship;
  /**
   * The judge's own sentence, in the answer's language — and the empty string whenever the
   * pipeline rather than the judge decided this claim, because a headless package holds no
   * wording. The app writes those sentences from its catalogue; `relationship` plus whether
   * any evidence is in hand tells the cases apart, so no extra field is needed:
   * `unavailable` = the search never got out; `unanchored` = the judge decided something the
   * gate could not find in the sources; `insufficient` with no evidence = the search completed
   * and found nothing; `insufficient` with evidence = the judging call did not come through.
   * The judge's own reasoning is never empty (the schema demands min(1)), so an empty one here
   * always means the pipeline decided.
   */
  reasoning: string;
  /**
   * The decisive sentence the judge copied out of the evidence, verbatim — the anchor gate has
   * already checked it really is in there. Empty whenever no verdict of the judge's stands.
   * Stored and shown: this is the one line of the source that decided the claim, and putting it
   * in front of the learner is the whole difference between a citation and a piece of evidence.
   */
  quote: string;
  /** Ordered cited-first — the links the judge actually leaned on come before the rest. */
  evidence: EvidenceItem[];
}

export interface FactCheckReport {
  claims: CheckedClaim[];
  usage: TokenUsage;
  /** Evidence providers that failed at least once during this run. The headless package has
   * no DB; the host records these in ai_failures. */
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

  deps.onStage?.("extracting");
  const extraction = await chatJson(
    deps.llmConfig,
    buildClaimExtractionMessages(userQuestion, assistantAnswer),
    claimExtractionSchema,
  );
  usages.push(extraction.usage);
  const extracted = extraction.parsed.claims;
  if (extracted.length === 0) {
    return { claims: [], usage: sumUsages(usages), failedProviders: [] };
  }

  // Searching is the network half and costs no LLM quota, so every claim may search at once —
  // at most four, and each claim walks its own providers one at a time, so this is four
  // outbound requests in flight, each still under its own request budget (evidence/
  // requestBudget.ts), never a burst of them.
  deps.onStage?.("gathering");
  const gathered = await mapWithConcurrency(extracted, extracted.length, (claim) =>
    gatherEvidence(deps.providers, claim.queries, maxEvidence),
  );
  for (const result of gathered) {
    for (const name of result.failedProviders) failedProviders.add(name);
  }

  // Judging is the metered half, so it runs under the tighter ceiling.
  deps.onStage?.("judging");
  const claims = await mapWithConcurrency(
    extracted,
    deps.judgeConcurrency ?? DEFAULT_JUDGE_CONCURRENCY,
    async (claim, index) => {
      const result = gathered[index];
      if (result === undefined || result.items.length === 0) {
        return emptyEvidenceClaim(claim.text, result?.searchFailed === true);
      }
      // Shuffled before judging, seeded by the claim so a re-run of the same claim gets the
      // same order: the judge's position bias must not track provider priority. Seeded by the
      // claim rather than by anything about the run, so running claims in parallel cannot
      // change what any one of them is shown.
      const evidence = seededShuffle(result.items, claim.text);
      return judgeClaim(deps.llmConfig, claim.text, evidence, usages);
    },
  );

  return { claims, usage: sumUsages(usages), failedProviders: [...failedProviders] };
}

/** No evidence in hand — either the search came back empty, or it never came back at all.
 * No judge spoke here, so no reasoning is written: the app says it in the reader's language. */
function emptyEvidenceClaim(text: string, searchFailed: boolean): CheckedClaim {
  return {
    text,
    relationship: searchFailed ? "unavailable" : "insufficient",
    reasoning: "",
    quote: "",
    evidence: [],
  };
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
