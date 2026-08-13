/**
 * Purpose: records one chat round's llm_calls row and refreshes the three cost views chatStore
 * shows (conversation total / today total / the sidebar's conversation list) — split out to
 * keep chatStore.ts's sendMessage under the file-size cap; nothing companion-specific here.
 * Main exports: recordRoundCost.
 */
import { BUILTIN_MODEL_PRICES, calculateCostMicros, type TokenUsage } from "@breadcrumb/core-llm";
import type { Repos } from "./db";
import { newId, nowIso, todayLocalMidnightIso } from "./time";

export interface RoundCostSnapshot {
  conversationCost: Awaited<ReturnType<Repos["llmCalls"]["sumCostForConversation"]>>;
  todayCost: Awaited<ReturnType<Repos["llmCalls"]["sumCostSince"]>>;
  conversations: Awaited<ReturnType<Repos["conversations"]["listByKind"]>>;
}

export async function recordRoundCost(
  repos: Pick<Repos, "llmCalls" | "conversations">,
  params: { conversationId: string; purpose: string; model: string; usage: TokenUsage },
): Promise<RoundCostSnapshot> {
  const price = BUILTIN_MODEL_PRICES[params.model];
  await repos.llmCalls.record({
    id: newId(),
    conversation_id: params.conversationId,
    purpose: params.purpose,
    model: params.model,
    input_tokens: params.usage.inputTokens,
    output_tokens: params.usage.outputTokens,
    cost_micros: price ? calculateCostMicros(params.usage, price) : 0,
    currency: price?.currency ?? "CNY",
    created_at: nowIso(),
  });
  const [conversationCost, todayCost, conversations] = await Promise.all([
    repos.llmCalls.sumCostForConversation(params.conversationId),
    repos.llmCalls.sumCostSince(todayLocalMidnightIso()),
    repos.conversations.listByKind("chat"),
  ]);
  return { conversationCost, todayCost, conversations };
}
