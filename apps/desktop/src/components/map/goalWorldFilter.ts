/**
 * Purpose: goal mode's map cut — a world model reduced to the places that hold at least one
 * goal node, so setWorld genuinely redraws a smaller map and the exact-fit camera refits to
 * the remaining extent (replacing the old label dimming). A positional re-layout is
 * deliberately not done: island positions must stay stable across modes (same tree, same
 * map), so hide-and-refit is the faithful implementation. Inside a kept island, kingdoms
 * without goal nodes lose their name and seat; the island's inked frontier lines stay as
 * terrain line-work because they are chained and smoothed island-wide at build time and
 * cannot be attributed back to single kingdoms.
 * Main exports: filterWorldToGoal.
 */
import type { WorldModel } from "@breadcrumb/feature-map";

export function filterWorldToGoal(world: WorldModel, goalNodeIds: ReadonlySet<string>): WorldModel {
  const islands = world.islands
    .filter((island) => island.memberNodeIds.some((id) => goalNodeIds.has(id)))
    .map((island) => ({
      ...island,
      kingdoms: island.kingdoms.filter((kingdom) =>
        kingdom.memberNodeIds.some((id) => goalNodeIds.has(id)),
      ),
    }));
  const islets = world.islets.filter((islet) => goalNodeIds.has(islet.nodeId));
  return { islands, islets };
}
