/**
 * Purpose: builds the per-node "productive use" footprint the T7a intuition trend layer
 * needs — sighting instants whose message came from the user's own turn, not the assistant's.
 * Main exports: buildProductiveUseTimesByNode.
 */
import type { NodeSightingRow } from "@breadcrumb/core-db";
import type { Repos } from "./db";

/** For every distinct conversation a sighting touched, pulls its messages once (deduped
 * per conversation, not per sighting) and keeps only user-authored ids; a sighting counts as
 * productive use only when its own `message_id` is one of those. Sightings without a
 * `message_id` (no attributable turn) are skipped. */
export async function buildProductiveUseTimesByNode(
  repos: Repos,
  sightings: readonly NodeSightingRow[],
): Promise<Map<string, string[]>> {
  const conversationIds = [...new Set(sightings.map((sighting) => sighting.conversation_id))];
  const messagesByConversation = await Promise.all(
    conversationIds.map((conversationId) => repos.messages.listByConversation(conversationId)),
  );
  const userMessageIds = new Set<string>();
  for (const messages of messagesByConversation) {
    for (const message of messages) {
      if (message.role === "user") userMessageIds.add(message.id);
    }
  }

  const timesByNode = new Map<string, string[]>();
  for (const sighting of sightings) {
    if (sighting.message_id === null || !userMessageIds.has(sighting.message_id)) continue;
    const times = timesByNode.get(sighting.node_id) ?? [];
    times.push(sighting.created_at);
    timesByNode.set(sighting.node_id, times);
  }
  return timesByNode;
}
