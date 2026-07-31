/**
 * Purpose: assembles the Pixi scene for a world model — paper, sea, terrain, band
 * containers, fog under the names, banners, ink reveals and the footprint layer.
 * Main exports: buildWorldScene, WorldScene, FlyRequest.
 */
import {
  averageRetention,
  type IslandModel,
  type WorldModel,
  type WorldPoint,
} from "@breadcrumb/plugin-map";
import { Container, Graphics, type Text, TilingSprite } from "pixi.js";
import { strokeDashedPath } from "./drawPrimitives";
import { buildFogLayer } from "./fog";
import { drawIslandTerrain } from "./islandArt";
import { buildPlacePositions, type RevealTarget } from "./livingMap";
import type { MapArt } from "./mapArtAssets";
import { addBannerBehind, type LabelSets, labelDim, makeLabel } from "./mapLabels";
import { mapTheme } from "./mapTheme";
import { buildIslandRelief, stampSprite } from "./reliefArt";
import { buildSeaLayer } from "./seaArt";
import { buildVillagePlan } from "./villageArt";

export interface FlyRequest {
  position: WorldPoint;
  scale: number;
}

export interface WorldScene {
  root: Container;
  geoParts: Container[];
  kingdomParts: Container[];
  villageParts: Container[];
  /** Engraving detail (woods) — hidden in the geographic view. */
  detailParts: Container[];
  /** Settlement icons — fade out as micro-plans take over. */
  iconParts: Container[];
  /** Settlement micro-plans (deepest zoom band). */
  planParts: Container[];
  labelSets: LabelSets;
  /** Session trail dashes, redrawn in place as the walk grows. */
  footprintLayer: Graphics;
  placePositions: Map<string, WorldPoint>;
  /** Newly learned places currently fading in. */
  revealTargets: RevealTarget[];
}

interface SceneParts {
  terrain: Container;
  terrainDetail: Container;
  kingdomContent: Container;
  villageContent: Container;
  villageIconsLayer: Container;
  villagePlans: Container;
  geoLabels: Container;
  kingdomLabels: Container;
  villageLabels: Container;
}

function buildIslandParts(
  island: IslandModel,
  retentionByNode: ReadonlyMap<string, number>,
  art: MapArt,
  newNodeIds: ReadonlySet<string>,
  onFly: (request: FlyRequest) => void,
  parts: SceneParts,
  labelSets: LabelSets,
  revealTargets: RevealTarget[],
): void {
  parts.terrain.addChild(drawIslandTerrain(island));
  const relief = buildIslandRelief(island, art.mountainSeries, art.hillSeries, art.trees);
  parts.terrainDetail.addChild(relief.detail);
  parts.terrain.addChild(relief.landmarks);

  const borders = new Graphics();
  for (const path of island.kingdomBorderPaths) {
    strokeDashedPath(borders, path, 6, 5, { width: 1.4, color: mapTheme.inkSoft, alpha: 0.85 });
  }
  parts.kingdomContent.addChild(borders);

  const islandDim = labelDim(averageRetention(island.memberNodeIds, retentionByNode));
  const islandLabel = makeLabel(island.label, mapTheme.labelSizes.island, islandDim, {
    letterSpacing: 6,
    onTap: () => onFly({ position: island.center, scale: 1.0 }),
  });
  islandLabel.position.set(island.center.x, island.center.y - island.radius - 28);
  parts.geoLabels.addChild(islandLabel);
  labelSets.islandLabels.push({ label: islandLabel, islandRadius: island.radius });

  const villageDots = new Graphics();
  const villageIcons = new Container();
  villageIcons.sortableChildren = true;
  const pointDots = new Graphics();

  const reveal = (object: Container): void => {
    object.alpha = 0;
    revealTargets.push({ object, delay: revealTargets.length * 0.12, elapsed: 0 });
  };

  for (const kingdom of island.kingdoms) {
    const kingdomDim = labelDim(averageRetention(kingdom.memberNodeIds, retentionByNode));
    const kingdomLabel = makeLabel(kingdom.label, mapTheme.labelSizes.kingdom, kingdomDim, {
      letterSpacing: 3,
    });
    kingdomLabel.position.set(kingdom.labelPosition.x, kingdom.labelPosition.y);
    parts.kingdomLabels.addChild(kingdomLabel);
    labelSets.kingdomLabelTexts.push(kingdomLabel);

    for (const village of kingdom.villages) {
      villageDots.circle(village.position.x, village.position.y, 2.2);
      // Settlement grows with knowledge: farm -> village -> town -> walled city.
      const settlementTexture = art.settlementByTier[village.tier - 1];
      if (settlementTexture !== undefined) {
        const iconHolder = new Container();
        stampSprite(iconHolder, settlementTexture, village.position, 14 + village.tier * 5, false);
        villageIcons.addChild(iconHolder);
        if (newNodeIds.has(village.nodeId)) reveal(iconHolder);
      }
      parts.villagePlans.addChild(buildVillagePlan(village));

      const villageDim = labelDim(averageRetention(village.memberNodeIds, retentionByNode));
      const villageLabel = makeLabel(village.label, mapTheme.labelSizes.village, villageDim, {
        letterSpacing: 1,
        onTap: () => onFly({ position: village.position, scale: 3.0 }),
      });
      villageLabel.position.set(village.position.x, village.position.y + 20);
      const plate = new Container();
      addBannerBehind(plate, villageLabel);
      plate.addChild(villageLabel);
      parts.villageLabels.addChild(plate);
      if (newNodeIds.has(village.nodeId)) reveal(plate);

      for (const point of village.points) {
        pointDots.circle(point.position.x, point.position.y, 1.5);
        const pointDim = labelDim(retentionByNode.get(point.nodeId) ?? 1);
        const pointLabel = makeLabel(point.label, mapTheme.labelSizes.point, 0.9 * pointDim, {
          italic: true,
        });
        pointLabel.anchor.set(0, 0.5);
        pointLabel.position.set(point.position.x + 4, point.position.y);
        parts.villageLabels.addChild(pointLabel);
        if (newNodeIds.has(point.nodeId)) reveal(pointLabel);
      }
    }
  }
  villageDots.fill({ color: mapTheme.ink, alpha: 0.8 });
  pointDots.fill({ color: mapTheme.inkSoft, alpha: 0.9 });
  parts.kingdomContent.addChild(villageDots);
  parts.villageIconsLayer.addChild(villageIcons);
  parts.villageContent.addChild(pointDots);
}

function buildPaperBackground(world: WorldModel, art: MapArt): TilingSprite {
  let minX = -600;
  let minY = -600;
  let maxX = 600;
  let maxY = 600;
  for (const island of world.islands) {
    minX = Math.min(minX, island.center.x - island.radius - 600);
    minY = Math.min(minY, island.center.y - island.radius - 600);
    maxX = Math.max(maxX, island.center.x + island.radius + 600);
    maxY = Math.max(maxY, island.center.y + island.radius + 600);
  }
  const paper = new TilingSprite({ texture: art.paper, width: maxX - minX, height: maxY - minY });
  paper.position.set(minX, minY);
  paper.tileScale.set(0.7);
  paper.alpha = 0.32;
  return paper;
}

export function buildWorldScene(
  world: WorldModel,
  retentionByNode: ReadonlyMap<string, number>,
  art: MapArt,
  newNodeIds: ReadonlySet<string>,
  onFly: (request: FlyRequest) => void,
): WorldScene {
  const parts: SceneParts = {
    terrain: new Container(),
    terrainDetail: new Container(),
    kingdomContent: new Container(),
    villageContent: new Container(),
    villageIconsLayer: new Container(),
    villagePlans: new Container(),
    geoLabels: new Container(),
    kingdomLabels: new Container(),
    villageLabels: new Container(),
  };
  const labelSets: LabelSets = { islandLabels: [], kingdomLabelTexts: [] as Text[] };
  const revealTargets: RevealTarget[] = [];
  for (const island of world.islands) {
    buildIslandParts(
      island,
      retentionByNode,
      art,
      newNodeIds,
      onFly,
      parts,
      labelSets,
      revealTargets,
    );
  }
  const fog = buildFogLayer(world, retentionByNode);
  const footprintLayer = new Graphics();

  const root = new Container();
  // Fog sits above all drawn content but below every name — names stay readable.
  root.addChild(
    buildPaperBackground(world, art),
    buildSeaLayer(world, art),
    parts.terrain,
    parts.terrainDetail,
    parts.kingdomContent,
    parts.villageContent,
    parts.villageIconsLayer,
    parts.villagePlans,
    fog,
    footprintLayer,
    parts.kingdomLabels,
    parts.villageLabels,
    parts.geoLabels,
  );
  return {
    root,
    geoParts: [parts.geoLabels],
    kingdomParts: [parts.kingdomContent, parts.kingdomLabels],
    villageParts: [parts.villageContent, parts.villageLabels],
    detailParts: [parts.terrainDetail],
    iconParts: [parts.villageIconsLayer],
    planParts: [parts.villagePlans],
    labelSets,
    footprintLayer,
    placePositions: buildPlacePositions(world),
    revealTargets,
  };
}
