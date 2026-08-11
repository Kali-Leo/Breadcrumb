/**
 * Purpose: assembles the Pixi world scene — sea/frame, terrain, level bands
 * (world names / kingdom names / village content), unnamed islets and sea decor in the
 * world band, fog under names, footprints, ink reveals. Levels are driven by MapView;
 * this file only builds containers.
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
import { type LabelSets, labelDim, makeLabel } from "./mapLabels";
import { mapTheme } from "./mapTheme";
import { drawIslandSettlements, type TapTarget } from "./sceneSettlements";
import { buildSeaLayer } from "./seaArt";
import { buildSeaDecorLayer } from "./seaDecor";

export type { TapTarget } from "./sceneSettlements";

export interface WorldScene {
  root: Container;
  /** Island names — the world level's only captions. */
  worldBand: Container;
  /** Kingdom names — shown at the island level. */
  islandBand: Container;
  /** Village icons, names and knowledge points — shown at the kingdom level. */
  kingdomBand: Container;
  /** Kingdom frontiers — visible from the island level down. */
  bordersLayer: Container;
  labelSets: LabelSets;
  footprintLayer: Graphics;
  placePositions: Map<string, WorldPoint>;
  revealTargets: RevealTarget[];
}

interface SceneParts {
  terrain: Container;
  borders: Container;
  worldBand: Container;
  islandBand: Container;
  kingdomBand: Container;
}

function buildIslandParts(
  island: IslandModel,
  islandIndex: number,
  retentionByNode: ReadonlyMap<string, number>,
  art: MapArt,
  newNodeIds: ReadonlySet<string>,
  onTap: (target: TapTarget) => void,
  parts: SceneParts,
  labelSets: LabelSets,
  revealTargets: RevealTarget[],
): void {
  parts.terrain.addChild(drawLandmass(island));

  const borders = new Graphics();
  for (const path of island.kingdomBorderPaths) {
    strokeDashedPath(borders, path, 6, 5, { width: 1.2, color: mapTheme.inkSoft, alpha: 0.8 });
  }
  parts.borders.addChild(borders);

  const islandDim = labelDim(averageRetention(island.memberNodeIds, retentionByNode));
  const islandLabel = makeLabel(island.label, mapTheme.labelSizes.island, islandDim, {
    letterSpacing: 6,
    onTap: () => onTap({ kind: "island", nodeId: island.nodeId }),
  });
  // Alternate names above/below neighbouring islands — the cartographer's dodge.
  const labelSide = islandIndex % 2 === 0 ? -1 : 1;
  islandLabel.position.set(island.center.x, island.center.y + labelSide * (island.radius + 34));
  parts.worldBand.addChild(islandLabel);
  labelSets.islandLabels.push(islandLabel);

  const reveal = (object: Container): void => {
    object.alpha = 0;
    revealTargets.push({ object, delay: revealTargets.length * 0.12, elapsed: 0 });
  };
  drawIslandSettlements(island, retentionByNode, art, newNodeIds, onTap, parts, labelSets, reveal);
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
    kingdomBand: new Container(),
  };
  const labelSets: LabelSets = {
    islandLabels: [],
    kingdomLabels: [],
    villageLabels: [],
    pointLabels: [],
  };
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
      labelSets,
      revealTargets,
    );
  });
  const fog = buildFogLayer(world, retentionByNode);
  const footprintLayer = new Graphics();

  const root = new Container();
  // Fog sits above all drawn content but below every name — names stay readable.
  root.addChild(
    buildSeaLayer(world, art),
    parts.terrain,
    parts.borders,
    fog,
    footprintLayer,
    parts.kingdomBand,
    parts.islandBand,
    parts.worldBand,
  );
  return {
    root,
    worldBand: parts.worldBand,
    islandBand: parts.islandBand,
    kingdomBand: parts.kingdomBand,
    bordersLayer: parts.borders,
    labelSets,
    footprintLayer,
    placePositions: buildPlacePositions(world),
    revealTargets,
  };
}
