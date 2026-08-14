/**
 * Purpose: door-word candidates for a focus session's current station text (spec 042 §3) — a
 * sighting-free twin of conceptDoors.ts: a focus answer never runs extraction, so every known
 * knowledge node is a candidate and pickDoors matches it straight against the station text. Any
 * failure degrades to no doors (never blocks the overlay from showing).
 * Main exports: computeFocusDoorPatches.
 */
import { type DoorCandidate, pickDoors } from "@breadcrumb/plugin-explore";
import { computeMastery } from "@breadcrumb/plugin-memory";
import { nowIso } from "./time";

export async function computeFocusDoorPatches(
  answerText: string,
  alreadyOpenedNodeIds: ReadonlySet<string>,
): Promise<DoorCandidate[]> {
  try {
    const [{ getRepos }, { useKnowledgeStore }, { useMemoryStore }] = await Promise.all([
      import("./db"),
      import("../stores/knowledgeStore"),
      import("../stores/memoryStore"),
    ]);
    const nodes = useKnowledgeStore.getState().nodes;
    if (nodes.length === 0) return [];

    const repos = await getRepos();
    const [sightings, claims] = await Promise.all([
      repos.nodeSightings.listAll(),
      repos.masteryClaims.listAll(),
    ]);
    const masteryByNode = computeMastery(sightings, claims, nowIso());
    const retentionByNode = useMemoryStore.getState().retentionByNode;

    return pickDoors({
      messageText: answerText,
      messageNodes: nodes.map((node) => ({ nodeId: node.id, label: node.label })),
      masteryByNode,
      curiosityByNode: new Map(),
      retentionByNode,
      alreadyOpenedNodeIds,
    });
  } catch (error) {
    console.warn("focus door picking skipped:", error);
    return [];
  }
}
