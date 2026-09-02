/**
 * Purpose: assembles the Pixi world scene — sea/frame, the two level bands (island names at
 * the world level, kingdom seats and names at the island level), unnamed islets and sea decor
 * in the world band, the hover highlight layer, fog under names, footprints, ink reveals.
 * Each continent itself is drawn by sceneIsland.ts; here they are placed and stacked.
 * Main exports: buildWorldScene, WorldScene, ScreenSize.
 */
import type { WorldModel, WorldPoint } from "@breadcrumb/feature-map";
import { Container, Graphics } from "pixi.js";
import { buildFogLayer } from "./fog";
import { drawLandmass } from "./islandArt";
import { frameForLevel } from "./levels";
import { buildPlacePositions, type RevealTarget } from "./livingMap";
import type { MapArt } from "./mapArtAssets";
import {
  type IslandLabelPlacement,
  type IslandLabelRequest,
  placeIslandLabels,
} from "./mapIslandLabels";
import type { LabelBox } from "./mapLabelPlacement";
import type { MapLabel } from "./mapLabels";
import { mapTheme } from "./mapTheme";
import {
  buildIslandScene,
  ISLAND_LETTER_SPACING,
  type SceneContext,
  type SceneParts,
} from "./sceneIsland";
import { buildSeaLayer } from "./seaArt";
import { buildSeaDecorLayer, planSeaDecor, seaDecorObstacles } from "./seaDecor";

/** The canvas the map draws into — it fixes every level's camera scale, hence placement. */
export interface ScreenSize {
  width: number;
  height: number;
}

export interface WorldScene {
  root: Container;
  /** Island names, islets and sea decor — the world level's own content. */
  worldBand: Container;
  /** Kingdom seats and names — shown at the island level, the deepest view. */
  islandBand: Container;
  /** Kingdom frontiers — visible at the island level. */
  bordersLayer: Container;
  /** Amber wash under the pointer; repainted by mapHover, never rebuilt. */
  highlightLayer: Graphics;
  labels: MapLabel[];
  footprintLayer: Graphics;
  placePositions: Map<string, WorldPoint>;
  revealTargets: RevealTarget[];
}

/** Island names are read at the world level, so they dodge each other at that scale. */
function islandLabelPositions(
  world: WorldModel,
  worldScale: number,
  obstacles: readonly LabelBox[],
): Map<string, IslandLabelPlacement> {
  const requests: IslandLabelRequest[] = world.islands.map((island) => ({
    nodeId: island.nodeId,
    content: island.label,
    center: island.center,
    radius: island.radius,
    letterSpacingRatio: ISLAND_LETTER_SPACING,
  }));
  return placeIslandLabels(requests, mapTheme.labelSizes.island, worldScale, obstacles);
}

export function buildWorldScene(
  world: WorldModel,
  retentionByNode: ReadonlyMap<string, number>,
  art: MapArt,
  newNodeIds: ReadonlySet<string>,
  screen: ScreenSize,
): WorldScene {
  const parts: SceneParts = {
    terrain: new Container(),
    borders: new Container(),
    worldBand: new Container(),
    islandBand: new Container(),
  };
  const context: SceneContext = {
    world,
    retentionByNode,
    art,
    newNodeIds,
    screen,
    worldScale: frameForLevel(world, { kind: "world" }, screen.width, screen.height).scale,
    parts,
    labels: [],
    revealTargets: [],
  };
  // Islets and sea decor go into the world band first, so island names stay on top of them.
  // Both belong to the world view only and fade away on a dive.
  for (const islet of world.islets) {
    parts.worldBand.addChild(drawLandmass(islet));
  }
  // Decor is planned before it is drawn: the same plan tells island names what to dodge.
  const decorPieces = planSeaDecor(world, art);
  parts.worldBand.addChild(buildSeaDecorLayer(decorPieces));
  const positions = islandLabelPositions(world, context.worldScale, seaDecorObstacles(decorPieces));
  for (const island of world.islands) {
    buildIslandScene(
      island,
      positions.get(island.nodeId) ?? { center: island.center, outside: false },
      context,
    );
  }
  const fog = buildFogLayer(world, retentionByNode);
  const footprintLayer = new Graphics();
  const highlightLayer = new Graphics();

  const root = new Container();
  // Fog sits above all drawn content but below every name — names stay readable. The hover
  // wash sits above the terrain it tints and below the seats and names it points at.
  root.addChild(
    buildSeaLayer(world, art),
    parts.terrain,
    parts.borders,
    fog,
    footprintLayer,
    highlightLayer,
    parts.islandBand,
    parts.worldBand,
  );
  return {
    root,
    worldBand: parts.worldBand,
    islandBand: parts.islandBand,
    bordersLayer: parts.borders,
    highlightLayer,
    labels: context.labels,
    footprintLayer,
    placePositions: buildPlacePositions(world),
    revealTargets: context.revealTargets,
  };
}
