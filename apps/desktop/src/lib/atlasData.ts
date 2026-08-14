/**
 * Purpose: loads one conversation's ExplorationAtlas (spec 039 §2.4) from local repos and
 * stores — sightings, the global edge library, node labels, and retention.
 * Main exports: loadAtlas. Dynamic-imports stores/db to avoid import cycles with them.
 */
import { buildExplorationAtlas, type ExplorationAtlas } from "@breadcrumb/plugin-explore";

/** Never throws — any failure degrades to null so the caller can show an empty state. */
export async function loadAtlas(conversationId: string): Promise<ExplorationAtlas | null> {
  try {
    const [{ getRepos }, { useKnowledgeStore }, { useMemoryStore }] = await Promise.all([
      import("./db"),
      import("../stores/knowledgeStore"),
      import("../stores/memoryStore"),
    ]);
    const repos = await getRepos();
    const [sightings, edges] = await Promise.all([
      repos.nodeSightings.listByConversation(conversationId),
      repos.knowledgeEdges.listAll(),
    ]);
    const labelsByNode = new Map(
      useKnowledgeStore.getState().nodes.map((node) => [node.id, node.label]),
    );
    const retentionByNode = useMemoryStore.getState().retentionByNode;
    return buildExplorationAtlas({ sightings, labelsByNode, edges, retentionByNode });
  } catch (error) {
    console.warn("atlas load skipped:", error);
    return null;
  }
}
