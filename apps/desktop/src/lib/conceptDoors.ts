/**
 * Purpose: assembles door candidates for one assistant message (spec 039 §2.1) — reads this
 * message's node sightings, current mastery/curiosity/retention, already-opened nodes and
 * the diglot weave's reserved spans, then delegates the pure selection to pickDoors. Any
 * failure degrades to no doors (zero-LLM, best-effort, never blocks the message from showing).
 * Main exports: computeDoorPatches. Dynamic-imports stores/db to avoid import cycles with them.
 */
import { type DoorCandidate, pickDoors } from "@breadcrumb/plugin-explore";

export async function computeDoorPatches(
  messageId: string,
  displaySource: string,
): Promise<DoorCandidate[]> {
  try {
    const [
      { getRepos },
      { useKnowledgeStore },
      { usePlannerStore },
      { useMemoryStore },
      { useDiglotStore },
      { useDoorStore },
    ] = await Promise.all([
      import("./db"),
      import("../stores/knowledgeStore"),
      import("../stores/plannerStore"),
      import("../stores/memoryStore"),
      import("../stores/diglotStore"),
      import("../stores/doorStore"),
    ]);
    const repos = await getRepos();
    const sightings = await repos.nodeSightings.listByMessage(messageId);
    if (sightings.length === 0) return [];

    const nodesById = new Map(useKnowledgeStore.getState().nodes.map((node) => [node.id, node]));
    const messageNodes = [...new Set(sightings.map((sighting) => sighting.node_id))]
      .map((nodeId) => {
        const node = nodesById.get(nodeId);
        return node === undefined ? null : { nodeId, label: node.label };
      })
      .filter((node): node is { nodeId: string; label: string } => node !== null);
    if (messageNodes.length === 0) return [];

    const plannerState = usePlannerStore.getState();
    const curiosityByNode = new Map(
      [...plannerState.interestScoresByNode.entries()].map(([nodeId, score]) => [
        nodeId,
        score.curiosity,
      ]),
    );
    const diglotPatches = useDiglotStore.getState().patchesByMessage.get(messageId) ?? [];

    return pickDoors({
      messageText: displaySource,
      messageNodes,
      masteryByNode: plannerState.masteryByNode,
      curiosityByNode,
      retentionByNode: useMemoryStore.getState().retentionByNode,
      alreadyOpenedNodeIds: useDoorStore.getState().openedNodeIds,
      reservedSpans: diglotPatches.map((patch) => ({ start: patch.start, end: patch.end })),
    });
  } catch (error) {
    console.warn("door picking skipped:", error);
    return [];
  }
}
