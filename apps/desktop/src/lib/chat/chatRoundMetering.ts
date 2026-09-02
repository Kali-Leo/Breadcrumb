/**
 * Purpose: records one chat round's llm_calls row (via metering.ts's single writer, so this
 * path can't drift from every other metered call's pricing/fallback-currency logic) and
 * refreshes the three cost views chatStore shows (conversation total / today total / the
 * sidebar's conversation list) — split out to keep chatStore.ts's sendMessage under the
 * file-size cap; nothing companion-specific here.
 * Main exports: recordRoundCost.
 */
import type { TokenUsage } from "@breadcrumb/core-llm";
import { recordMeteredCall } from "../billing/metering";
import type { Repos } from "../platform/db";
import { todayLocalMidnightIso } from "../platform/time";

export interface RoundCostSnapshot {
  conversationCost: Awaited<ReturnType<Repos["llmCalls"]["sumCostForConversation"]>>;
  todayCost: Awaited<ReturnType<Repos["llmCalls"]["sumCostSince"]>>;
  conversations: Awaited<ReturnType<Repos["conversations"]["listByKind"]>>;
}

export async function recordRoundCost(
  repos: Pick<Repos, "llmCalls" | "conversations">,
  params: {
    conversationId: string;
    purpose: string;
    model: string;
    usage: TokenUsage;
    /** See recordMeteredCall — forwarded when the caller has the raw response text handy;
     * omitted callers (e.g. the main round path, which doesn't plumb it through today) just
     * skip the under-count check rather than misfiring on missing data. */
    responseHadContent?: boolean;
  },
): Promise<RoundCostSnapshot> {
  await recordMeteredCall({
    purpose: params.purpose,
    model: params.model,
    conversationId: params.conversationId,
    usage: params.usage,
    responseHadContent: params.responseHadContent,
  });
  const [conversationCost, todayCost, conversations] = await Promise.all([
    repos.llmCalls.sumCostForConversation(params.conversationId),
    repos.llmCalls.sumCostSince(todayLocalMidnightIso()),
    repos.conversations.listByKind("chat"),
  ]);
  return { conversationCost, todayCost, conversations };
}
