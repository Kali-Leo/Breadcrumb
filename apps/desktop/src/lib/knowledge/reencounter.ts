/**
 * Purpose: silent re-encounter capture (核心价值:静默收集) — dwelling on a rendered
 * assistant message re-sights the nodes attributed to it, so rereading old ground lifts
 * FSRS retention at message granularity. Throttled per message (DB) and per node
 * (session). Side effects: DB writes, memory refresh.
 * Main exports: recordMessageReencounter, REENCOUNTER_THROTTLE_MS.
 */
import { getRepos } from "../platform/db";
import { newId, nowIso } from "../platform/time";

/** One re-encounter round per message per this window — rereading twice in an afternoon
 * is one study event, not two reviews. */
export const REENCOUNTER_THROTTLE_MS = 6 * 60 * 60 * 1000;

/** Session-level per-node throttle: several messages mentioning the same node during one
 * reading session yield one review, not many. */
const nodeResightAtMs = new Map<string, number>();

/** Re-sights the message's nodes unless the message (or the node) was sighted within the
 * throttle window. Fresh messages are naturally excluded: their extraction sightings are
 * seconds old. Returns how many nodes were re-sighted. */
export async function recordMessageReencounter(
  messageId: string,
  conversationId: string,
): Promise<number> {
  const repos = await getRepos();
  const sightings = await repos.nodeSightings.listByMessage(messageId);
  if (sightings.length === 0) return 0;
  const latest = sightings[sightings.length - 1];
  if (
    latest !== undefined &&
    Date.now() - new Date(latest.created_at).getTime() < REENCOUNTER_THROTTLE_MS
  ) {
    return 0;
  }
  const createdAt = nowIso();
  let resighted = 0;
  for (const nodeId of new Set(sightings.map((sighting) => sighting.node_id))) {
    const lastMs = nodeResightAtMs.get(nodeId) ?? 0;
    if (Date.now() - lastMs < REENCOUNTER_THROTTLE_MS) continue;
    nodeResightAtMs.set(nodeId, Date.now());
    await repos.nodeSightings.record({
      id: newId(),
      node_id: nodeId,
      conversation_id: conversationId,
      message_id: messageId,
      created_at: createdAt,
      // A re-encounter revisits a node already stationed on this message — no new
      // provenance to record (spec 040 §7).
      origin_node_id: null,
    });
    resighted += 1;
  }
  if (resighted > 0) {
    // Lift the fog right away — the map should reflect the re-encounter.
    const { useMemoryStore } = await import("../../stores/memoryStore");
    void useMemoryStore.getState().refresh();
  }
  return resighted;
}
