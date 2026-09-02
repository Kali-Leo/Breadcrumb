/**
 * Purpose: zustand store for the learner's own map place names (map_place_names, source
 * 'user') — loaded once per palace visit, written through on rename, and read by
 * useWorldModel to lay the names over the built world. The repo's upsert already refuses to
 * let an AI row overwrite a user row; this store only ever writes user rows. Writes are
 * best-effort: a failed save is logged and the previous name stays on screen.
 * Main exports: useMapPlaceNameStore.
 */
import { create } from "zustand";
import { userPlaceNames } from "../lib/map/placeNames";
import { getRepos } from "../lib/platform/db";
import { degradeSilently } from "../lib/platform/failureLog";
import { nowIso } from "../lib/platform/time";

const PURPOSE = "map-place-names";

interface MapPlaceNameState {
  /** node id → the name the learner gave that island, kingdom or islet. */
  names: ReadonlyMap<string, string>;
  loaded: boolean;
  load(): Promise<void>;
  /** Saves a name; an empty (or whitespace) name restores the original instead. */
  rename(nodeId: string, label: string): Promise<void>;
  restore(nodeId: string): Promise<void>;
}

export const useMapPlaceNameStore = create<MapPlaceNameState>((set, get) => ({
  names: new Map(),
  loaded: false,

  async load() {
    try {
      const repos = await getRepos();
      set({ names: userPlaceNames(await repos.mapPlaceNames.listAll()), loaded: true });
    } catch (error) {
      degradeSilently(PURPOSE, error);
    }
  },

  async rename(nodeId, label) {
    const trimmed = label.trim();
    if (trimmed === "") {
      await get().restore(nodeId);
      return;
    }
    if (get().names.get(nodeId) === trimmed) return;
    try {
      const repos = await getRepos();
      await repos.mapPlaceNames.upsert({
        node_id: nodeId,
        custom_label: trimmed,
        source: "user",
        updated_at: nowIso(),
      });
      set({ names: new Map(get().names).set(nodeId, trimmed) });
    } catch (error) {
      degradeSilently(PURPOSE, error);
    }
  },

  async restore(nodeId) {
    if (!get().names.has(nodeId)) return;
    try {
      const repos = await getRepos();
      await repos.mapPlaceNames.removeOverride(nodeId);
      const names = new Map(get().names);
      names.delete(nodeId);
      set({ names });
    } catch (error) {
      degradeSilently(PURPOSE, error);
    }
  },
}));
