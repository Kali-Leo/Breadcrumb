/**
 * Purpose: assembles the Pixi world scene — sea/frame, terrain, the two level bands
 * (island names at the world level, kingdom seats and names at the island level), unnamed
 * islets and sea decor in the world band, the hover highlight layer, fog under names,
 * footprints, ink reveals. Names are sized by class and moved apart by mapLabelPlacement.
 * Main exports: buildWorldScene, WorldScene, TapTarget, ScreenSize.
 */
import {
  averageRetention,
  type IslandModel,
  type WorldModel,
  type WorldPoint,
} from "@breadcrumb/plugin-map";
import { Container, Graphics } from "pixi.js";
import { strokeDashedPath } from "./drawPrimitives";
import { buildFogLayer } from "./fog";
import { drawLandmass } from "./islandArt";
import { frameForLevel } from "./levels";
import { buildPlacePositions, type RevealTarget } from "./livingMap";
import type { MapArt } from "./mapArtAssets";
import { type IslandLabelRequest, type LabelBox, placeIslandLabels } from "./mapLabelPlacement";
import { labelDim, type MapLabel, makeMapLabel } from "./mapLabels";
import { mapTheme } from "./mapTheme";
import { drawIslandSettlements } from "./sceneSettlements";
import { buildSeaLayer } from "./seaArt";
import { buildSeaDecorLayer, planSeaDecor, seaDecorObstacles } from "./seaDecor";

/** Island names are set loose enough to read as engraved place names. */
const ISLAND_LETTER_SPACING = 0.2;

/** Only island names are tappable — they are the one place a tap can travel to. */
export interface TapTarget {
  kind: "island";
  nodeId: string;
}

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

interface SceneParts {
  terrain: Container;
  borders: Container;
  worldBand: Container;
  islandBand: Container;
}

interface SceneContext {
  world: WorldModel;
  retentionByNode: ReadonlyMap<string, number>;
  art: MapArt;
  newNodeIds: ReadonlySet<string>;
  onTap: (target: TapTarget) => void;
  screen: ScreenSize;
  parts: SceneParts;
  labels: MapLabel[];
  revealTargets: RevealTarget[];
}

function buildIsland(island: IslandModel, namePosition: WorldPoint, context: SceneContext): void {
  context.parts.terrain.addChild(drawLandmass(island));

  const borders = new Graphics();
  for (const path of island.kingdomBorderPaths) {
    strokeDashedPath(borders, path, 6, 5, { width: 1.2, color: mapTheme.inkSoft, alpha: 0.8 });
  }
  context.parts.borders.addChild(borders);

  const islandDim = labelDim(averageRetention(island.memberNodeIds, context.retentionByNode));
  const islandLabel = makeMapLabel(island.label, mapTheme.labelSizes.island, islandDim, {
    letterSpacingRatio: ISLAND_LETTER_SPACING,
    onTap: () => context.onTap({ kind: "island", nodeId: island.nodeId }),
  });
  islandLabel.text.position.set(namePosition.x, namePosition.y);
  context.parts.worldBand.addChild(islandLabel.text);
  context.labels.push(islandLabel);

  const reveal = (object: Container): void => {
    object.alpha = 0;
    const delay = context.revealTargets.length * 0.12;
    context.revealTargets.push({ object, delay, elapsed: 0 });
  };
  drawIslandSettlements({
    island,
    retentionByNode: context.retentionByNode,
    art: context.art,
    newNodeIds: context.newNodeIds,
    islandBand: context.parts.islandBand,
    islandScale: frameForLevel(
      context.world,
      { kind: "island", islandId: island.nodeId },
      context.screen.width,
      context.screen.height,
    ).scale,
    labels: context.labels,
    reveal,
  });
}

/** Island names are read at the world level, so they dodge each other at that scale. */
function islandLabelPositions(
  world: WorldModel,
  screen: ScreenSize,
  obstacles: readonly LabelBox[],
): Map<string, WorldPoint> {
  const requests: IslandLabelRequest[] = world.islands.map((island) => ({
    nodeId: island.nodeId,
    content: island.label,
    center: island.center,
    radius: island.radius,
    letterSpacingRatio: ISLAND_LETTER_SPACING,
  }));
  const worldScale = frameForLevel(world, { kind: "world" }, screen.width, screen.height).scale;
  return placeIslandLabels(requests, mapTheme.labelSizes.island, worldScale, obstacles);
}

export function buildWorldScene(
  world: WorldModel,
  retentionByNode: ReadonlyMap<string, number>,
  art: MapArt,
  newNodeIds: ReadonlySet<string>,
  onTap: (target: TapTarget) => void,
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
    onTap,
    screen,
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
  const positions = islandLabelPositions(world, screen, seaDecorObstacles(decorPieces));
  for (const island of world.islands) {
    buildIsland(island, positions.get(island.nodeId) ?? island.center, context);
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
