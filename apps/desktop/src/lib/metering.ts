/**
 * Purpose: shared cost metering — records one LLM call row (billed via the builtin price
 * table; unknown models record zero) so every feature's spend shows up in the meters.
 * Main exports: recordMeteredCall.
 */
import { BUILTIN_MODEL_PRICES, calculateCostMicros, type TokenUsage } from "@breadcrumb/core-llm";
import { getRepos } from "./db";
import { newId, nowIso } from "./time";

export async function recordMeteredCall(input: {
  purpose: string;
  model: string;
  conversationId: string | null;
  usage: TokenUsage;
}): Promise<void> {
  const repos = await getRepos();
  const price = BUILTIN_MODEL_PRICES[input.model];
  await repos.llmCalls.record({
    id: newId(),
    conversation_id: input.conversationId,
    purpose: input.purpose,
    model: input.model,
    input_tokens: input.usage.inputTokens,
    output_tokens: input.usage.outputTokens,
    cost_micros: price ? calculateCostMicros(input.usage, price) : 0,
    currency: price?.currency ?? "USD",
    created_at: nowIso(),
  });
}
