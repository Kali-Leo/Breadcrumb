/**
 * Purpose: judging one claim against the evidence gathered for it — the verdict call, the
 * mechanical anchor gate over its answer, and the citation-first ordering of what the learner
 * then sees. Split out of pipeline.ts so that file is about the shape of a run and this one is
 * about the shape of a single judgement.
 * Main exports: judgeClaim, citedFirst.
 */

import type { TokenUsage } from "@breadcrumb/core-llm";
import {
  ChatJsonError,
  type ChatMessage,
  chatJson,
  type LlmClientConfig,
} from "@breadcrumb/core-llm";
import { gateVerdict } from "./anchorGate";
import type { EvidenceItem } from "./evidence/provider";
import type { CheckedClaim } from "./pipeline";
import { buildVerdictMessages, createVerdictSchema } from "./verdict";

/** Cited evidence first (in the judge's own citation order), everything else after. */
export function citedFirst(
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

/**
 * One claim, judged. Never throws: a judging call that fails comes back as a claim the app can
 * still render, because the learner is waiting on the whole round and one broken call must not
 * take the other three with it. `usages` is appended to rather than returned so a call that
 * failed halfway still leaves its spend on the books.
 */
export async function judgeClaim(
  llmConfig: LlmClientConfig,
  claimText: string,
  evidence: EvidenceItem[],
  usages: TokenUsage[],
): Promise<CheckedClaim> {
  const messages: ChatMessage[] = buildVerdictMessages(claimText, evidence);
  try {
    const verdict = await chatJson(llmConfig, messages, createVerdictSchema(evidence.length));
    usages.push(verdict.usage);
    // The mechanical gate, not a second opinion: a decided verdict whose quote is not in the
    // material is not a verdict. Its reasoning goes with it — that sentence describes a
    // judgement that no longer stands — and so does the quote, which was never in the sources.
    // `unanchored` rather than plain `insufficient`: "资料里找不到能直接对上的原句" and "这次没
    // 查成" are two different things to be told, and only a separate outcome keeps them apart.
    const gated = gateVerdict(verdict.parsed, evidence);
    return {
      text: claimText,
      relationship: gated.downgraded ? "unanchored" : gated.relationship,
      reasoning: gated.downgraded ? "" : verdict.parsed.reasoning,
      quote: gated.downgraded ? "" : verdict.parsed.quote,
      evidence: citedFirst(evidence, verdict.parsed.supportingEvidence),
    };
  } catch (error) {
    // The provider billed us for every attempt that reached it, including the ones we then
    // rejected — dropping that usage would under-state the user's spend.
    if (error instanceof ChatJsonError) usages.push(error.usage);
    // Evidence in hand but no reasoning: the app reads that pair as "the judging call did
    // not finish" and writes the sentence itself.
    return { text: claimText, relationship: "insufficient", reasoning: "", quote: "", evidence };
  }
}
