/**
 * Purpose: assembles the Pixi world scene — sea/frame, terrain, the two level bands
 * (island names at the world level, kingdom seats and names at the island level), unnamed
 * islets and sea decor in the world band, the hover highlight layer, fog under names,
 * footprints, ink reveals. Levels are driven by mapController; this file only builds
 * containers.
 * Main exports: buildWorldScene, WorldScene, TapTarget.
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
import { buildPlacePositions, type RevealTarget } from "./livingMap";
import type { MapArt } from "./mapArtAssets";
import { type FittedLabel, labelDim, makeFittedLabel } from "./mapLabels";
import { mapTheme } from "./mapTheme";
import { drawIslandSettlements } from "./sceneSettlements";
import { buildSeaLayer } from "./seaArt";
import { buildSeaDecorLayer } from "./seaDecor";

/** Only island names are tappable — they are the one place a tap can travel to. */
export interface TapTarget {
  kind: "island";
  nodeId: string;
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
  labels: FittedLabel[];
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

function buildIslandParts(
  island: IslandModel,
  islandIndex: number,
  retentionByNode: ReadonlyMap<string, number>,
  art: MapArt,
  newNodeIds: ReadonlySet<string>,
  onTap: (target: TapTarget) => void,
  parts: SceneParts,
  labels: FittedLabel[],
  revealTargets: RevealTarget[],
): void {
  parts.terrain.addChild(drawLandmass(island));

  const borders = new Graphics();
  for (const path of island.kingdomBorderPaths) {
    strokeDashedPath(borders, path, 6, 5, { width: 1.2, color: mapTheme.inkSoft, alpha: 0.8 });
  }
  parts.borders.addChild(borders);

  const islandDim = labelDim(averageRetention(island.memberNodeIds, retentionByNode));
  // The name must stay inside its own island, so it can never reach a neighbour's.
  const islandLabel = makeFittedLabel(
    island.label,
    {
      availableWorldWidth: island.radius * 2 * 0.9,
      minScreenSize: mapTheme.labelSizes.island.min,
      maxScreenSize: mapTheme.labelSizes.island.max,
    },
    islandDim,
    {
      letterSpacingRatio: 0.2,
      onTap: () => onTap({ kind: "island", nodeId: island.nodeId }),
    },
  );
  // Alternate names above/below neighbouring islands — the cartographer's dodge.
  const labelSide = islandIndex % 2 === 0 ? -1 : 1;
  islandLabel.text.position.set(
    island.center.x,
    island.center.y + labelSide * (island.radius + 34),
  );
  parts.worldBand.addChild(islandLabel.text);
  labels.push(islandLabel);

  const reveal = (object: Container): void => {
    object.alpha = 0;
    revealTargets.push({ object, delay: revealTargets.length * 0.12, elapsed: 0 });
  };
  drawIslandSettlements(island, retentionByNode, art, newNodeIds, parts.islandBand, labels, reveal);
}

export function buildWorldScene(
  world: WorldModel,
  retentionByNode: ReadonlyMap<string, number>,
  art: MapArt,
  newNodeIds: ReadonlySet<string>,
  onTap: (target: TapTarget) => void,
): WorldScene {
  const parts: SceneParts = {
    terrain: new Container(),
    borders: new Container(),
    worldBand: new Container(),
    islandBand: new Container(),
  };
  const labels: FittedLabel[] = [];
  const revealTargets: RevealTarget[] = [];
  // Islets and sea decor go into the world band first, so island names stay on top of them.
  // Both belong to the world view only and fade away on a dive.
  for (const islet of world.islets) {
    parts.worldBand.addChild(drawLandmass(islet));
  }
  parts.worldBand.addChild(buildSeaDecorLayer(world, art));
  world.islands.forEach((island, islandIndex) => {
    buildIslandParts(
      island,
      islandIndex,
      retentionByNode,
      art,
      newNodeIds,
      onTap,
      parts,
      labels,
      revealTargets,
    );
  });
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
    labels,
    footprintLayer,
    placePositions: buildPlacePositions(world),
    revealTargets,
  };
}
