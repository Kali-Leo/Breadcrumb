/**
 * Purpose: assembles the Pixi world scene — sea/frame, terrain, level bands
 * (world names / kingdom names / village content), fog under names, footprints,
 * ink reveals. Levels are driven by MapView; this file only builds containers.
 * Main exports: buildWorldScene, WorldScene, TapTarget.
 */
import {
  averageRetention,
  type IslandModel,
  type WorldModel,
  type WorldPoint,
} from "@breadcrumb/plugin-map";
import { Container, Graphics, Sprite, type Texture } from "pixi.js";

/** Places one art stamp grounded at its position, painter-ordered by y. */
export function stampSprite(
  container: Container,
  texture: Texture,
  position: WorldPoint,
  worldWidth: number,
): void {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, 0.85);
  const scale = worldWidth / Math.max(texture.width, 1);
  sprite.scale.set(scale);
  sprite.position.set(position.x, position.y);
  sprite.zIndex = position.y;
  container.addChild(sprite);
}

/** Kingdom seat grandeur grows with the branch's knowledge. */
function seatTextureFor(art: MapArt, memberCount: number): Texture | undefined {
  const tier =
    memberCount <= 3
      ? 0
      : memberCount <= 7
        ? 1
        : memberCount <= 12
          ? 2
          : memberCount <= 18
            ? 3
            : memberCount <= 28
              ? 4
              : 5;
  return art.kingdomSeats[Math.min(tier, art.kingdomSeats.length - 1)];
}

import { strokeDashedPath } from "./drawPrimitives";
import { buildFogLayer } from "./fog";
import { drawIslandTerrain } from "./islandArt";
import { buildPlacePositions, type RevealTarget } from "./livingMap";
import type { MapArt } from "./mapArtAssets";
import { type LabelSets, labelDim, makeLabel } from "./mapLabels";
import { mapTheme } from "./mapTheme";
import { buildSeaLayer } from "./seaArt";

export interface TapTarget {
  kind: "island" | "village";
  nodeId: string;
}

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
  parts.terrain.addChild(drawIslandTerrain(island));

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

  const pointDots = new Graphics();
  for (const kingdom of island.kingdoms) {
    const kingdomDim = labelDim(averageRetention(kingdom.memberNodeIds, retentionByNode));
    // Every realm gets one large seat building; its grandeur tracks knowledge size.
    const seatTexture = seatTextureFor(art, kingdom.memberNodeIds.length);
    if (seatTexture !== undefined) {
      const seat = new Container();
      stampSprite(seat, seatTexture, kingdom.labelPosition, 70 + kingdom.memberNodeIds.length * 3);
      seat.alpha = kingdomDim;
      parts.islandBand.addChild(seat);
    }
    const kingdomLabel = makeLabel(kingdom.label, mapTheme.labelSizes.kingdom, kingdomDim, {
      letterSpacing: 3,
    });
    kingdomLabel.position.set(kingdom.labelPosition.x, kingdom.labelPosition.y + 22);
    parts.islandBand.addChild(kingdomLabel);
    labelSets.kingdomLabels.push(kingdomLabel);

    for (const village of kingdom.villages) {
      // Settlement grows with knowledge: farm -> village -> town -> walled city.
      const settlementTexture = art.settlementByTier[village.tier - 1];
      if (settlementTexture !== undefined) {
        const iconHolder = new Container();
        stampSprite(iconHolder, settlementTexture, village.position, 15 + village.tier * 5);
        parts.kingdomBand.addChild(iconHolder);
        if (newNodeIds.has(village.nodeId)) reveal(iconHolder);
      }
      const villageDim = labelDim(averageRetention(village.memberNodeIds, retentionByNode));
      const villageLabel = makeLabel(village.label, mapTheme.labelSizes.village, villageDim, {
        letterSpacing: 1,
        onTap: () => onTap({ kind: "village", nodeId: village.nodeId }),
      });
      villageLabel.position.set(village.position.x, village.position.y + 20);
      parts.kingdomBand.addChild(villageLabel);
      labelSets.villageLabels.push(villageLabel);
      if (newNodeIds.has(village.nodeId)) reveal(villageLabel);

      for (const point of village.points) {
        pointDots.circle(point.position.x, point.position.y, 1.4);
        const pointDim = labelDim(retentionByNode.get(point.nodeId) ?? 1);
        const pointLabel = makeLabel(point.label, mapTheme.labelSizes.point, 0.9 * pointDim, {
          italic: true,
        });
        pointLabel.anchor.set(0, 0.5);
        pointLabel.position.set(point.position.x + 4, point.position.y);
        parts.kingdomBand.addChild(pointLabel);
        labelSets.pointLabels.push(pointLabel);
        if (newNodeIds.has(point.nodeId)) reveal(pointLabel);
      }
    }
  }
  pointDots.fill({ color: mapTheme.inkSoft, alpha: 0.9 });
  parts.kingdomBand.addChild(pointDots);
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
