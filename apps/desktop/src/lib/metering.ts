/**
 * Purpose: the single writer for llm_calls rows — every metered call site (companion
 * memory, diglot refine, factcheck, edge/interest extraction, the chat round via
 * chatRoundMetering, ...) goes through this one row-construction path so pricing and
 * currency logic can't drift between call sites the way it already had (this file defaulted
 * unknown models to USD; chatRoundMetering.ts's hand-rolled copy defaulted to CNY — a real
 * bug, mixed-currency ledgers for anyone on an unlisted model). Also flags a metering
 * under-count instead of silently trusting it.
 * Main exports: recordMeteredCall, recordFailedCallUsage.
 */
import {
  ChatJsonError,
  calculateCostMicros,
  resolveModelPrice,
  type TokenUsage,
} from "@breadcrumb/core-llm";
import { getRepos } from "./db";
import { recordAiFailure } from "./failureLog";
import { currentPriceCurrency } from "./llmConfig";
import { newId, nowIso } from "./time";

/** Currency stamped on a row for a model with no builtin price. Such a row always costs 0 —
 * we have no rate to bill it at — so the label is inert; the column is NOT NULL and needs
 * something. It must never be read as a claim that the account is billed in USD. */
const UNPRICED_ROW_CURRENCY = "USD";

export async function recordMeteredCall(input: {
  purpose: string;
  model: string;
  conversationId: string | null;
  usage: TokenUsage;
  /** Whether the provider's response actually had content, independent of what `usage`
   * reports — pass this when the caller can see the raw response text, so a 0/0-token
   * response that was NOT actually empty gets flagged rather than silently recorded as a
   * free call. Omit when the caller can't tell (the row is still recorded as-is either way). */
  responseHadContent?: boolean;
}): Promise<void> {
  const repos = await getRepos();
  const price = resolveModelPrice(input.model, currentPriceCurrency());
  await repos.llmCalls.record({
    id: newId(),
    conversation_id: input.conversationId,
    purpose: input.purpose,
    model: input.model,
    input_tokens: input.usage.inputTokens,
    output_tokens: input.usage.outputTokens,
    cost_micros: price ? calculateCostMicros(input.usage, price) : 0,
    currency: price?.currency ?? UNPRICED_ROW_CURRENCY,
    created_at: nowIso(),
  });
  // Some providers ignore stream_options usage reporting and report 0/0 tokens on a real,
  // non-empty response — recording that as a free call would silently understate spend, so
  // instead of trusting it we surface the gap where it's visible (spec 014's debug table).
  const meterUndercounted =
    input.usage.inputTokens === 0 &&
    input.usage.outputTokens === 0 &&
    input.responseHadContent === true;
  if (meterUndercounted) {
    await recordAiFailure(
      "metering",
      `zero input/output tokens recorded for purpose "${input.purpose}" (model "${input.model}") despite a non-empty response — the provider likely ignored stream_options usage reporting, so this call's cost is under-counted as 0`,
    );
  }
}

/**
 * Records what a chatJson call had already cost when it gave up. chatJson throws a
 * ChatJsonError carrying the usage of every request that actually reached the provider —
 * the malformed and Zod-rejected ones are billed exactly like the good ones, so dropping
 * them under-states the user's spend (宪法原则 2). Best-effort and safe to `void`: any other
 * error carries no usage (the request never reached the provider), a zero-token failure has
 * nothing to record, and recording must never compound the failure it is reporting.
 */
export async function recordFailedCallUsage(
  error: unknown,
  input: { purpose: string; model: string; conversationId: string | null },
): Promise<void> {
  if (!(error instanceof ChatJsonError)) return;
  if (error.usage.inputTokens === 0 && error.usage.outputTokens === 0) return;
  try {
    await recordMeteredCall({ ...input, usage: error.usage });
  } catch {
    // best-effort: the caller is already inside a catch that is degrading silently.
  }
}
