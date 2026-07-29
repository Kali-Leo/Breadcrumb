/**
 * Purpose: zustand store for the knowledge map — computes place layout from nodes and
 * their local embeddings, and keeps it fresh as extraction lands new knowledge.
 * Main exports: useMapStore.
 */
import { computeMapLayout, type MapPlace } from "@breadcrumb/plugin-map";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { embedMissingNodes } from "../lib/embeddings";
import { appEventBus } from "./chatStore";

interface MapState {
  places: MapPlace[];
  /** How many nodes still await an embedding (shown as "测绘中" in the UI). */
  unchartedCount: number;
  refresh(): Promise<void>;
}

export const useMapStore = create<MapState>((set) => ({
  places: [],
  unchartedCount: 0,

  async refresh() {
    await embedMissingNodes();
    const repos = await getRepos();
    const [nodes, embeddingRows] = await Promise.all([
      repos.knowledgeNodes.listAll(),
      repos.nodeEmbeddings.listAll(),
    ]);
    const embeddings = new Map<string, readonly number[]>(
      embeddingRows.map((row) => [row.node_id, JSON.parse(row.vector_json) as number[]]),
    );
    set({
      places: computeMapLayout(nodes, embeddings),
      unchartedCount: nodes.filter((node) => !embeddings.has(node.id)).length,
    });
  },
}));

// New knowledge should appear on the map soon after extraction lands it.
appEventBus.on("chat:responseFinished", () => {
  setTimeout(() => void useMapStore.getState().refresh(), 6000);
});
