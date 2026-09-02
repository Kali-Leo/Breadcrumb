/**
 * Purpose: DB-touching half of trail auto-naming (spec 041 §1) — loads one conversation's
 * stations and first message, then writes the recomputed auto_title when the freeze check
 * allows it. Called after every send round and after every knowledge-extraction pass.
 * Main exports: refreshConversationAutoTitle.
 */
import type { ConversationRow, MessageRow, NodeSightingRow } from "@breadcrumb/core-db";
import { computeAutoTitle, shouldWriteAutoTitle, stationLabelsFromSightings } from "./trailNaming";

/** The narrow slice of Repos this action needs — any real Repos bundle satisfies it, and a
 * test double only has to implement these three methods instead of every repo method. */
export interface TrailNamingRepos {
  conversations: {
    getById(id: string): Promise<ConversationRow | null>;
    setAutoTitle(id: string, autoTitle: string | null): Promise<void>;
  };
  nodeSightings: { listByConversation(conversationId: string): Promise<NodeSightingRow[]> };
  messages: { listByConversation(conversationId: string): Promise<MessageRow[]> };
}

export async function refreshConversationAutoTitle(
  repos: TrailNamingRepos,
  conversationId: string,
  labelsByNode: ReadonlyMap<string, string>,
): Promise<void> {
  const [conversation, sightings, messages] = await Promise.all([
    repos.conversations.getById(conversationId),
    repos.nodeSightings.listByConversation(conversationId),
    repos.messages.listByConversation(conversationId),
  ]);
  if (conversation === null) return;
  const firstMessageContent = messages[0]?.content ?? "";
  if (!shouldWriteAutoTitle(conversation, firstMessageContent)) return;

  const autoTitle = computeAutoTitle(stationLabelsFromSightings(sightings, labelsByNode));
  if (autoTitle === conversation.auto_title) return;
  await repos.conversations.setAutoTitle(conversationId, autoTitle);
}
