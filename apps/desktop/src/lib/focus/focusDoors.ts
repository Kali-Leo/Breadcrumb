/**
 * Purpose: door-word candidates for a focus session's current station text (spec 043 §6-7) —
 * the focus-session twin of conceptDoors.ts. Primary source is the LLM term-marking call
 * (ensureTermMarks, target "focus_node"); the old sighting-free "every known node is a
 * candidate" match (spec 042 §3) is now secondary, hub-generic nodes excluded (spec 043 §7).
 * Any failure degrades to no doors (never blocks the overlay from showing).
 * Main exports: computeFocusDoorPatches.
 */
import {
  computeNodeConversationCoverage,
  type DoorCandidate,
  isHubGenericNode,
  locateTermPatches,
  pickDoors,
} from "@breadcrumb/feature-explore";
import { computeMastery } from "@breadcrumb/feature-memory";
import { nowIso } from "../platform/time";
import { ensureTermMarks } from "./termMarking";

export async function computeFocusDoorPatches(
  answerText: string,
  alreadyOpenedNodeIds: ReadonlySet<string>,
  focusNodeId: string,
  conversationId: string,
): Promise<DoorCandidate[]> {
  try {
    const [{ getRepos }, { useKnowledgeStore }, { useMemoryStore }] = await Promise.all([
      import("../platform/db"),
      import("../../stores/knowledgeStore"),
      import("../../stores/memoryStore"),
    ]);
    const repos = await getRepos();
    const [sightings, claims] = await Promise.all([
      repos.nodeSightings.listAll(),
      repos.masteryClaims.listAll(),
    ]);
    // memoryStore's cached retention instead of a second full FSRS replay over the same
    // sightings (design audit 2026-08-28, 记忆与遗忘模型 #8) — the same substitution
    // conceptDoors.ts makes. It was replayed from exactly this footprint set (listAll), and
    // door ranking is coarse enough that its few seconds of staleness cannot change the pick.
    const retentionByNode = useMemoryStore.getState().retentionByNode;
    const masteryByNode = computeMastery(sightings, claims, nowIso(), retentionByNode);

    // Primary source (spec 043 §6).
    const terms = await ensureTermMarks("focus_node", focusNodeId, answerText, conversationId);
    const nodes = useKnowledgeStore.getState().nodes;
    const nodeIdByLabel = new Map(nodes.map((node) => [node.label, node.id]));
    const termDoors: DoorCandidate[] = locateTermPatches(answerText, terms, []).map((door) => ({
      ...door,
      nodeId: nodeIdByLabel.get(door.original) ?? null,
    }));

    if (nodes.length === 0) return termDoors.sort((a, b) => a.start - b.start);

    // Secondary source (spec 043 §7): every known node is still a candidate, hub-generic ones
    // excluded, never overlapping a term door's span.
    const childCountByParent = new Map<string, number>();
    for (const node of nodes) {
      if (node.parent_id === null) continue;
      childCountByParent.set(node.parent_id, (childCountByParent.get(node.parent_id) ?? 0) + 1);
    }
    const coverageByNode = computeNodeConversationCoverage(sightings);
    const nonHubNodes = nodes
      .filter(
        (node) =>
          !isHubGenericNode({
            label: node.label,
            childCount: childCountByParent.get(node.id) ?? 0,
            conversationCoverage: coverageByNode.get(node.id) ?? 0,
          }),
      )
      .map((node) => ({ nodeId: node.id, label: node.label }));

    const legacyDoors = pickDoors({
      messageText: answerText,
      messageNodes: nonHubNodes,
      masteryByNode,
      curiosityByNode: new Map(),
      retentionByNode,
      alreadyOpenedNodeIds,
      reservedSpans: termDoors,
    });

    return [...termDoors, ...legacyDoors].sort((a, b) => a.start - b.start);
  } catch (error) {
    console.warn("focus door picking skipped:", error);
    return [];
  }
}
