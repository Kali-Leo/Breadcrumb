/**
 * Purpose: silent re-encounter capture (核心价值:静默收集) — re-reading an old
 * conversation IS a re-encounter with its knowledge nodes, so a dwelled-on conversation
 * re-sights its distinct nodes and lifts their FSRS retention. Previously this signal was
 * simply lost. Throttled per conversation. Side effects: DB writes, memory refresh.
 * Main exports: recordConversationReencounter, REENCOUNTER_THROTTLE_MS.
 */
import { getRepos } from "./db";
import { newId, nowIso } from "./time";

/** A conversation only yields one re-encounter round per this window — rereading twice in
 * an afternoon is one study event, not two reviews. */
export const REENCOUNTER_THROTTLE_MS = 6 * 60 * 60 * 1000;

/** Records a re-sighting for every distinct node of the conversation, unless the
 * conversation already produced sightings inside the throttle window. Returns how many
 * nodes were re-sighted (0 = throttled or nothing to re-sight). */
export async function recordConversationReencounter(conversationId: string): Promise<number> {
  const repos = await getRepos();
  const sightings = await repos.nodeSightings.listByConversation(conversationId);
  if (sightings.length === 0) return 0;
  const latest = sightings[sightings.length - 1];
  if (
    latest !== undefined &&
    Date.now() - new Date(latest.created_at).getTime() < REENCOUNTER_THROTTLE_MS
  ) {
    return 0;
  }
  const distinctNodeIds = [...new Set(sightings.map((sighting) => sighting.node_id))];
  const createdAt = nowIso();
  for (const nodeId of distinctNodeIds) {
    await repos.nodeSightings.record({
      id: newId(),
      node_id: nodeId,
      conversation_id: conversationId,
      message_id: null,
      created_at: createdAt,
    });
  }
  // Lift the fog right away — the map should reflect the re-encounter.
  const { useMemoryStore } = await import("../stores/memoryStore");
  void useMemoryStore.getState().refresh();
  return distinctNodeIds.length;
}
