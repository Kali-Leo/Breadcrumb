/**
 * Purpose: the learner's own names for places on the map — pure helpers that turn the
 * map_place_names rows into a lookup and lay it over a built world model without touching
 * terrain. Names only: positions and sizes keep their daily freeze (layoutDay), a rename
 * shows the moment it is saved. AI continent names stay in their own member-set-keyed cache
 * (mapNamingActions); a user name is applied after them here, so it always wins.
 * Main exports: placeKeyOf, userPlaceNames, applyPlaceNames, isPlaceRenamable.
 */
import type { MapPlaceNameRow } from "@breadcrumb/core-db";
import type { IslandModel, WorldModel } from "@breadcrumb/feature-map";

/** An island's model id is prefixed (`continent:<root node id>`) so it cannot collide with
 * a kingdom's; map_place_names is keyed by the real knowledge node id, which the foreign key
 * enforces. This is the one place that strips the prefix (2026-09-02 walkthrough: writing
 * the prefixed id failed the foreign key on every island rename). */
const ISLAND_ID_PREFIX = "continent:";
export function placeKeyOf(modelNodeId: string): string {
  return modelNodeId.startsWith(ISLAND_ID_PREFIX)
    ? modelNodeId.slice(ISLAND_ID_PREFIX.length)
    : modelNodeId;
}

/** node id → the name the learner gave it. Only user rows count for display: an AI row in
 * the table is a suggestion the map never shows on its own. */
export function userPlaceNames(rows: readonly MapPlaceNameRow[]): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const row of rows) {
    const label = row.custom_label.trim();
    if (row.source === "user" && label !== "") names.set(row.node_id, label);
  }
  return names;
}

/**
 * A cluster continent borrows its earliest member's node id, so that member kingdom and the
 * island share one id. The name belongs to the island; the kingdom keeps its own label and
 * cannot be renamed separately (renaming it would rename the island).
 */
export function isPlaceRenamable(island: IslandModel, kingdomId: string): boolean {
  return kingdomId !== placeKeyOf(island.nodeId);
}

function renameIsland(island: IslandModel, names: ReadonlyMap<string, string>): IslandModel {
  const ownName = names.get(placeKeyOf(island.nodeId));
  let changed = ownName !== undefined && ownName !== island.label;
  const kingdoms = island.kingdoms.map((kingdom) => {
    const name = isPlaceRenamable(island, kingdom.nodeId) ? names.get(kingdom.nodeId) : undefined;
    if (name === undefined || name === kingdom.label) return kingdom;
    changed = true;
    return { ...kingdom, label: name };
  });
  if (!changed) return island;
  return { ...island, label: ownName ?? island.label, kingdoms };
}

/** The same world with the learner's names in place. Returns the input object itself when
 * nothing changes, so the scene cache and the Pixi rebuild are not disturbed for nothing. */
export function applyPlaceNames(world: WorldModel, names: ReadonlyMap<string, string>): WorldModel {
  if (names.size === 0) return world;
  let changed = false;
  const islands = world.islands.map((island) => {
    const renamed = renameIsland(island, names);
    if (renamed !== island) changed = true;
    return renamed;
  });
  const islets = world.islets.map((islet) => {
    const name = names.get(islet.nodeId);
    if (name === undefined || name === islet.label) return islet;
    changed = true;
    return { ...islet, label: name };
  });
  return changed ? { islands, islets } : world;
}
