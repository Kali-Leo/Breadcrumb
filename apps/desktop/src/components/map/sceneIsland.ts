/**
 * Purpose: draws one continent into the scene — its landmass, kingdom frontiers, its name
 * (which lies on the island itself, with a leader line back to the coast when it had to sail),
 * and the settlements below it. Also owns the containers and shared state every island draws
 * into, since that is the only thing they are for.
 * Main exports: buildIslandScene, SceneParts, SceneContext.
 */
import { averageRetention, type IslandModel, type WorldModel } from "@breadcrumb/plugin-map";
import { type Container, Graphics } from "pixi.js";
import { strokeDashedPath } from "./drawPrimitives";
import { drawLandmass } from "./islandArt";
import { frameForLevel } from "./levels";
import type { RevealTarget } from "./livingMap";
import type { MapArt } from "./mapArtAssets";
import type { IslandLabelPlacement } from "./mapIslandLabels";
import { labelBoxSize } from "./mapLabelPlacement";
import { labelDim, type MapLabel, makeMapLabel } from "./mapLabels";
import { mapTheme } from "./mapTheme";
import type { ScreenSize } from "./sceneBuild";
import { buildLabelLeader } from "./sceneLabelLeader";
import { drawIslandSettlements } from "./sceneSettlements";

/** Island names are set loose enough to read as engraved place names. */
export const ISLAND_LETTER_SPACING = 0.2;

export interface SceneParts {
  terrain: Container;
  borders: Container;
  worldBand: Container;
  islandBand: Container;
}

export interface SceneContext {
  world: WorldModel;
  retentionByNode: ReadonlyMap<string, number>;
  art: MapArt;
  newNodeIds: ReadonlySet<string>;
  screen: ScreenSize;
  /** The camera scale island names are read at — their world-unit box size derives from it. */
  worldScale: number;
  parts: SceneParts;
  labels: MapLabel[];
  revealTargets: RevealTarget[];
}

export function buildIslandScene(
  island: IslandModel,
  placement: IslandLabelPlacement,
  context: SceneContext,
): void {
  context.parts.terrain.addChild(drawLandmass(island));

  const borders = new Graphics();
  for (const path of island.kingdomBorderPaths) {
    strokeDashedPath(borders, path, 6, 5, { width: 1.2, color: mapTheme.inkSoft, alpha: 0.8 });
  }
  context.parts.borders.addChild(borders);

  const islandDim = labelDim(averageRetention(island.memberNodeIds, context.retentionByNode));
  const islandLabel = makeMapLabel(
    island.nodeId,
    island.label,
    mapTheme.labelSizes.island,
    islandDim,
    {
      letterSpacingRatio: ISLAND_LETTER_SPACING,
    },
  );
  islandLabel.text.position.set(placement.center.x, placement.center.y);
  // A name that had to sail is tied back to its own coast, else nobody can tell whose it is.
  if (placement.outside) {
    const box = labelBoxSize(
      island.label,
      ISLAND_LETTER_SPACING,
      mapTheme.labelSizes.island,
      context.worldScale,
    );
    const leader = buildLabelLeader(island, placement.center, box);
    if (leader !== null) context.parts.worldBand.addChild(leader);
  }
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
