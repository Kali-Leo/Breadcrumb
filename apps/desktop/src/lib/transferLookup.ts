/**
 * Purpose: pure lookup for one transfer station's other-trail listing (spec 041 §3) — every
 * other conversation that ever sighted the same node, newest first, capped at 5. No I/O.
 * Main exports: MAX_TRANSFER_LISTINGS, TransferListing, listOtherTrailsForNode.
 */
import type { NodeSightingRow } from "@breadcrumb/core-db";

export const MAX_TRANSFER_LISTINGS = 5;

export interface TransferListing {
  conversationId: string;
  /** The most recent sighting's message, or null when that sighting predates message-level
   * attribution — the popover can still open the conversation, just without a precise jump. */
  messageId: string | null;
  lastSeenAt: string;
}

/** One node's other conversations — deduped to each conversation's own most recent sighting,
 * newest conversation first. */
export function listOtherTrailsForNode(
  nodeId: string,
  currentConversationId: string,
  allSightings: readonly NodeSightingRow[],
): TransferListing[] {
  const latestByConversation = new Map<string, NodeSightingRow>();
  for (const sighting of allSightings) {
    if (sighting.node_id !== nodeId || sighting.conversation_id === currentConversationId) {
      continue;
    }
    const existing = latestByConversation.get(sighting.conversation_id);
    if (existing === undefined || sighting.created_at > existing.created_at) {
      latestByConversation.set(sighting.conversation_id, sighting);
    }
  }

  return [...latestByConversation.values()]
    .sort((a, b) => (a.created_at === b.created_at ? 0 : a.created_at > b.created_at ? -1 : 1))
    .slice(0, MAX_TRANSFER_LISTINGS)
    .map((sighting) => ({
      conversationId: sighting.conversation_id,
      messageId: sighting.message_id,
      lastSeenAt: sighting.created_at,
    }));
}
