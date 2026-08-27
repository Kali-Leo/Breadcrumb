/**
 * Purpose: pure zero-LLM trail grouping (spec 041 §2) — each trail's dominant knowledge node,
 * that node's top ancestor as the group label, and the sidebar's two-tier shape ("正在进行"
 * preview + topic groups). No I/O.
 * Main exports: CASUAL_CHAT_GROUP_KEY, computeDominantNodes, topAncestorOf, groupTrails.
 */
import type { ConversationRow, KnowledgeNodeRow, NodeSightingRow } from "@breadcrumb/core-db";

/** The group a trail with no knowledge node lands in — spec 041 §2's explicit fallback. Reads
 * from the gated copy module so this label and the sidebar's rendered text can never drift. */
/** Catalogue key for the group that holds trails with no dominant knowledge node. */
export const CASUAL_CHAT_GROUP_KEY = "learning:trail.casualChatGroupLabel";

/** Above this count, "正在进行" stops growing — it is a preview of recent activity, not the
 * whole day's list (the topic groups below hold every trail regardless). */
const MAX_ONGOING_TRAILS = 3;

/** Each conversation's most-sighted node — ties go to whichever node was first sighted (spec
 * 041 §2). Conversations with zero sightings are simply absent from the returned map. */
export function computeDominantNodes(
  sightings: readonly NodeSightingRow[],
): Map<string, string | null> {
  const countsByConversation = new Map<string, Map<string, number>>();
  const firstIndexByConversation = new Map<string, Map<string, number>>();

  sightings.forEach((sighting, index) => {
    const counts = countsByConversation.get(sighting.conversation_id) ?? new Map<string, number>();
    counts.set(sighting.node_id, (counts.get(sighting.node_id) ?? 0) + 1);
    countsByConversation.set(sighting.conversation_id, counts);

    const firstIndex =
      firstIndexByConversation.get(sighting.conversation_id) ?? new Map<string, number>();
    if (!firstIndex.has(sighting.node_id)) firstIndex.set(sighting.node_id, index);
    firstIndexByConversation.set(sighting.conversation_id, firstIndex);
  });

  const dominantByConversation = new Map<string, string | null>();
  for (const [conversationId, counts] of countsByConversation) {
    const firstIndex = firstIndexByConversation.get(conversationId) ?? new Map<string, number>();
    let bestNodeId: string | null = null;
    let bestCount = -1;
    let bestFirstIndex = Number.POSITIVE_INFINITY;
    for (const [nodeId, count] of counts) {
      const index = firstIndex.get(nodeId) ?? Number.POSITIVE_INFINITY;
      if (count > bestCount || (count === bestCount && index < bestFirstIndex)) {
        bestNodeId = nodeId;
        bestCount = count;
        bestFirstIndex = index;
      }
    }
    dominantByConversation.set(conversationId, bestNodeId);
  }
  return dominantByConversation;
}

/** Climbs parent_id to the root and returns that root's own id — cycle-guarded so a corrupt
 * parent chain degrades to "wherever the loop was first re-entered" instead of hanging. */
export function topAncestorOf(
  nodeId: string,
  nodesById: ReadonlyMap<string, KnowledgeNodeRow>,
): string {
  const visited = new Set<string>();
  let current = nodeId;
  while (!visited.has(current)) {
    visited.add(current);
    const node = nodesById.get(current);
    if (node === undefined || node.parent_id === null) return current;
    current = node.parent_id;
  }
  return current;
}

function byUpdatedAtDesc(a: ConversationRow, b: ConversationRow): number {
  if (a.updated_at === b.updated_at) return 0;
  return a.updated_at > b.updated_at ? -1 : 1;
}

export interface TrailGroup {
  label: string;
  trails: ConversationRow[];
}

export interface GroupedTrails {
  ongoing: ConversationRow[];
  groups: TrailGroup[];
}

export interface GroupTrailsInput {
  conversations: readonly ConversationRow[];
  dominantNodeByConversation: ReadonlyMap<string, string | null>;
  nodesById: ReadonlyMap<string, KnowledgeNodeRow>;
  /** ISO instant of local midnight — a conversation is "today" when updated_at falls on or
   * after this (matches lib/time.ts's todayLocalMidnightIso). */
  todaySinceIso: string;
}

/** Splits conversations into the "正在进行" preview (today's most recent, capped) and full
 * topic groups (every conversation, including today's — the preview and the groups overlap
 * on purpose: the preview is a lens, the groups are the exhaustive structure). Group order is
 * by each group's own most-recent trail; trails within a group are newest first. */
export function groupTrails(input: GroupTrailsInput): GroupedTrails {
  const { conversations, dominantNodeByConversation, nodesById, todaySinceIso } = input;

  const ongoing = conversations
    .filter((conversation) => conversation.updated_at >= todaySinceIso)
    .slice()
    .sort(byUpdatedAtDesc)
    .slice(0, MAX_ONGOING_TRAILS);

  const trailsByLabel = new Map<string, ConversationRow[]>();
  for (const conversation of conversations) {
    const dominantNodeId = dominantNodeByConversation.get(conversation.id) ?? null;
    const label =
      dominantNodeId === null
        ? CASUAL_CHAT_GROUP_KEY
        : (nodesById.get(topAncestorOf(dominantNodeId, nodesById))?.label ?? CASUAL_CHAT_GROUP_KEY);
    const bucket = trailsByLabel.get(label) ?? [];
    bucket.push(conversation);
    trailsByLabel.set(label, bucket);
  }
  for (const bucket of trailsByLabel.values()) bucket.sort(byUpdatedAtDesc);

  const groups = [...trailsByLabel.entries()]
    .map(([label, trails]) => ({ label, trails }))
    .sort((a, b) => {
      const aLatest = a.trails[0]?.updated_at ?? "";
      const bLatest = b.trails[0]?.updated_at ?? "";
      return aLatest === bLatest ? 0 : aLatest > bLatest ? -1 : 1;
    });

  return { ongoing, groups };
}
