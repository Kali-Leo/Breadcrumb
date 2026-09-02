/**
 * Purpose: answers "what sits under the pointer at this level" and paints the amber
 * hover wash for it — an island (or islet) coast at the world level, a kingdom territory
 * at the island level. Pure lookups plus one Graphics repaint; owns no camera or level state.
 * Main exports: HoverInfo, HoverResult, resolveHover, drawHoverHighlight.
 */
import type { KingdomModel, WorldModel, WorldPoint } from "@breadcrumb/feature-map";
import type { Graphics } from "pixi.js";
import { findIsland, hitIsland, hitIslet, hitKingdom, type MapLevel } from "./levels";
import { mapTheme } from "./mapTheme";

/** Amber accent (the app's amber-500) — the map's only non-Laham ink, hover feedback only. */
const HIGHLIGHT_COLOR = 0xf59e0b;
const KINGDOM_FILL_ALPHA = 0.1;
const ISLAND_FILL_ALPHA = 0.08;

export interface HoverInfo {
  kind: "island" | "islet" | "kingdom";
  nodeId: string;
  label: string;
  memberCount: number;
  childCount: number;
  pointLabels: string[];
}

export interface HoverHighlight {
  /** Areas washed in amber: a coast loop, or every cell of one kingdom. */
  areas: WorldPoint[][];
  fillAlpha: number;
  /** Border segments to ink — empty for coasts, which already carry an ink line. */
  outline: [WorldPoint, WorldPoint][];
}

export interface HoverResult {
  info: HoverInfo;
  highlight: HoverHighlight;
}

function edgeKey(a: WorldPoint, b: WorldPoint): string {
  const first = `${Math.round(a.x * 100)},${Math.round(a.y * 100)}`;
  const second = `${Math.round(b.x * 100)},${Math.round(b.y * 100)}`;
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

/**
 * The kingdom's own frontier: cell edges shared by two of its cells are interior, so an
 * edge seen exactly once is on the outside. Same trick the terrain uses for coastlines.
 */
function kingdomOutline(kingdom: KingdomModel): [WorldPoint, WorldPoint][] {
  const seen = new Map<string, { segment: [WorldPoint, WorldPoint]; count: number }>();
  for (const polygon of kingdom.cellPolygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      if (a === undefined || b === undefined) continue;
      const key = edgeKey(a, b);
      const entry = seen.get(key) ?? { segment: [a, b] as [WorldPoint, WorldPoint], count: 0 };
      entry.count += 1;
      seen.set(key, entry);
    }
  }
  return [...seen.values()].filter((entry) => entry.count === 1).map((entry) => entry.segment);
}

function islandHover(world: WorldModel, point: WorldPoint): HoverResult | null {
  const island = hitIsland(world, point);
  if (island !== null) {
    return {
      info: {
        kind: "island",
        nodeId: island.nodeId,
        label: island.label,
        memberCount: island.memberNodeIds.length,
        childCount: island.kingdoms.length,
        pointLabels: island.kingdoms.map((kingdom) => kingdom.label),
      },
      highlight: {
        areas: island.coastLoops.slice(0, 1),
        fillAlpha: ISLAND_FILL_ALPHA,
        outline: [],
      },
    };
  }
  // Nothing to dive into on an islet — the hover is the whole story it has.
  const islet = hitIslet(world, point);
  if (islet === null) return null;
  return {
    info: {
      kind: "islet",
      nodeId: islet.nodeId,
      label: islet.label,
      memberCount: 1,
      childCount: 0,
      pointLabels: [islet.label],
    },
    highlight: {
      areas: islet.coastLoops.slice(0, 1),
      fillAlpha: ISLAND_FILL_ALPHA,
      outline: [],
    },
  };
}

function kingdomHover(world: WorldModel, islandId: string, point: WorldPoint): HoverResult | null {
  const island = findIsland(world, islandId);
  const kingdom = island === undefined ? null : hitKingdom(island, point);
  if (kingdom === null) return null;
  return {
    info: {
      kind: "kingdom",
      nodeId: kingdom.nodeId,
      label: kingdom.label,
      memberCount: kingdom.memberNodeIds.length,
      childCount: kingdom.villages.length,
      // The panel still names what lives here, even though the map no longer draws it.
      pointLabels: kingdom.villages.flatMap((village) => [
        village.label,
        ...village.points.map((villagePoint) => villagePoint.label),
      ]),
    },
    highlight: {
      areas: kingdom.cellPolygons,
      fillAlpha: KINGDOM_FILL_ALPHA,
      outline: kingdomOutline(kingdom),
    },
  };
}

export function resolveHover(
  world: WorldModel,
  level: MapLevel,
  point: WorldPoint,
): HoverResult | null {
  if (level.kind === "world") return islandHover(world, point);
  return kingdomHover(world, level.islandId, point);
}

/** Repaints the whole hover layer; a null hover simply leaves it empty. */
export function drawHoverHighlight(layer: Graphics, hover: HoverResult | null): void {
  layer.clear();
  if (hover === null) return;
  // One fill for every area of the place: a kingdom's hundreds of cells wash as one region.
  for (const area of hover.highlight.areas) {
    if (area.length < 3) continue;
    layer.poly([...area], true);
  }
  layer.fill({ color: HIGHLIGHT_COLOR, alpha: hover.highlight.fillAlpha });
  for (const [a, b] of hover.highlight.outline) {
    layer.moveTo(a.x, a.y).lineTo(b.x, b.y);
  }
  if (hover.highlight.outline.length > 0) {
    layer.stroke({ width: 1.5, color: mapTheme.ink, alpha: 0.5, cap: "round" });
  }
}
