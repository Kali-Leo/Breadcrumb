/**
 * Purpose: zustand store for the knowledge map — computes place layout from nodes and
 * their local embeddings, and keeps it fresh as extraction lands new knowledge.
 * Main exports: useMapStore.
 */
import {
  computeLayeredMap,
  computeMapLayout,
  type LayeredMap,
  type MapPlace,
} from "@breadcrumb/plugin-map";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { embedMissingNodes } from "../lib/embeddings";
import { appEventBus } from "./chatStore";

interface MapState {
  places: MapPlace[];
  layered: LayeredMap | null;
  /** How many nodes still await an embedding (shown as "测绘中" in the UI). */
  unchartedCount: number;
  /** Surfaced instead of a silent empty chart when charting fails (honesty rule). */
  chartError: string | null;
  refresh(): Promise<void>;
}

export const useMapStore = create<MapState>((set) => ({
  places: [],
  layered: null,
  unchartedCount: 0,
  chartError: null,

  async refresh() {
    try {
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
        layered: computeLayeredMap(nodes, embeddings),
        unchartedCount: nodes.filter((node) => !embeddings.has(node.id)).length,
        chartError: null,
      });
    } catch (error) {
      console.error("map refresh failed:", error);
      set({ chartError: error instanceof Error ? `${error.message}` : String(error) });
    }
  },
}));

// New knowledge should appear on the map soon after extraction lands it.
appEventBus.on("chat:responseFinished", () => {
  setTimeout(() => void useMapStore.getState().refresh(), 6000);
});
