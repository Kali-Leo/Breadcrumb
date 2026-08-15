/**
 * Purpose: assembles door candidates for one assistant message (spec 043 §6-7) — the primary
 * source is the LLM term-marking call (ensureTermMarks), located in the display text via
 * locateTermPatches; the old sighted-node label match (spec 039 §2.1) is now secondary: it
 * only enriches a term-marked span with a nodeId (exact label match) and, for whatever it
 * doesn't cover, contributes its own independent doors — but only for nodes that aren't hub-
 * generic (spec 043 §7). Any failure degrades to no doors (best-effort, never blocks the
 * message from showing).
 * Main exports: computeDoorPatches. Dynamic-imports stores/db to avoid import cycles with them.
 */
import {
  computeNodeConversationCoverage,
  type DoorCandidate,
  isHubGenericNode,
  locateTermPatches,
  pickDoors,
} from "@breadcrumb/plugin-explore";
import { computeMastery, computeRetentionByNode } from "@breadcrumb/plugin-memory";
import { ensureTermMarks } from "./termMarking";
import { nowIso } from "./time";

export async function computeDoorPatches(
  messageId: string,
  displaySource: string,
  conversationId: string,
): Promise<DoorCandidate[]> {
  try {
    const [
      { getRepos },
      { useKnowledgeStore },
      { usePlannerStore },
      { useDiglotStore },
      { useDoorStore },
    ] = await Promise.all([
      import("./db"),
      import("../stores/knowledgeStore"),
      import("../stores/plannerStore"),
      import("../stores/diglotStore"),
      import("../stores/doorStore"),
    ]);
    const repos = await getRepos();

    const [allSightings, claims] = await Promise.all([
      repos.nodeSightings.listAll(),
      repos.masteryClaims.listAll(),
    ]);
    // Pre-encounter memory state: everything EXCEPT what this message itself contributed —
    // extraction re-sights a discussed node, which would otherwise mark it "just reviewed"
    // and veto its own door.
    const priorSightings = allSightings.filter((sighting) => sighting.message_id !== messageId);
    const now = nowIso();
    const retentionByNode = computeRetentionByNode(priorSightings, now);
    const masteryByNode = computeMastery(priorSightings, claims, now);

    const diglotPatches = useDiglotStore.getState().patchesByMessage.get(messageId) ?? [];
    const reservedSpans = diglotPatches.map((patch) => ({ start: patch.start, end: patch.end }));

    // Primary source (spec 043 §6): the LLM's own pick of what would trip this learner up.
    const terms = await ensureTermMarks("message", messageId, displaySource, conversationId);
    const knowledgeNodes = useKnowledgeStore.getState().nodes;
    const nodeIdByLabel = new Map(knowledgeNodes.map((node) => [node.label, node.id]));
    const termDoors: DoorCandidate[] = locateTermPatches(displaySource, terms, reservedSpans).map(
      (door) => ({ ...door, nodeId: nodeIdByLabel.get(door.original) ?? null }),
    );

    // Secondary source (spec 043 §7): the old sighted-node match, hub-generic nodes excluded,
    // never overlapping a term door's span.
    const sightings = await repos.nodeSightings.listByMessage(messageId);
    const childCountByParent = new Map<string, number>();
    for (const node of knowledgeNodes) {
      if (node.parent_id === null) continue;
      childCountByParent.set(node.parent_id, (childCountByParent.get(node.parent_id) ?? 0) + 1);
    }
    const coverageByNode = computeNodeConversationCoverage(allSightings);
    const nodesById = new Map(knowledgeNodes.map((node) => [node.id, node]));
    const nonHubMessageNodes = [...new Set(sightings.map((sighting) => sighting.node_id))]
      .map((nodeId) => nodesById.get(nodeId))
      .filter((node): node is (typeof knowledgeNodes)[number] => node !== undefined)
      .filter(
        (node) =>
          !isHubGenericNode({
            label: node.label,
            childCount: childCountByParent.get(node.id) ?? 0,
            conversationCoverage: coverageByNode.get(node.id) ?? 0,
          }),
      )
      .map((node) => ({ nodeId: node.id, label: node.label }));

    const plannerState = usePlannerStore.getState();
    const curiosityByNode = new Map(
      [...plannerState.interestScoresByNode.entries()].map(([nodeId, score]) => [
        nodeId,
        score.curiosity,
      ]),
    );

    const legacyDoors = pickDoors({
      messageText: displaySource,
      messageNodes: nonHubMessageNodes,
      masteryByNode,
      curiosityByNode,
      retentionByNode,
      alreadyOpenedNodeIds: useDoorStore.getState().openedNodeIds,
      reservedSpans: [...reservedSpans, ...termDoors],
    });

    return [...termDoors, ...legacyDoors].sort((a, b) => a.start - b.start);
  } catch (error) {
    console.warn("door picking skipped:", error);
    return [];
  }
}
