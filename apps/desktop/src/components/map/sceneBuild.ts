/**
 * Purpose: assembles the Pixi scene for a world model — terrain, band content and
 * label containers, fog between content and names, click-to-fly on labels.
 * Main exports: buildWorldScene, WorldScene, FlyRequest.
 */
import {
  averageRetention,
  type IslandModel,
  type WorldModel,
  type WorldPoint,
} from "@breadcrumb/plugin-map";
import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { drawHouseCluster, strokeDashedPath } from "./drawPrimitives";
import { buildFogLayer } from "./fog";
import { drawIslandTerrain } from "./islandArt";
import { mapTheme } from "./mapTheme";

export interface FlyRequest {
  position: WorldPoint;
  scale: number;
}

export interface WorldScene {
  root: Container;
  /** Containers whose alpha follows the geo / kingdom / village band visibility. */
  geoParts: Container[];
  kingdomParts: Container[];
  villageParts: Container[];
}

/** Fog dims a name through this factor but never below a readable floor. */
function labelDim(retention: number): number {
  return 0.55 + 0.45 * retention;
}

const LABEL_SUPERSAMPLE = 3;

function makeLabel(text: string, fontSize: number, alpha: number, onTap?: () => void): Text {
  const label = new Text({
    text,
    style: new TextStyle({
      fontFamily: mapTheme.fontFamily,
      fontSize: fontSize * LABEL_SUPERSAMPLE,
      fill: mapTheme.ink,
    }),
  });
  label.scale.set(1 / LABEL_SUPERSAMPLE);
  label.anchor.set(0.5);
  label.alpha = alpha;
  if (onTap !== undefined) {
    label.eventMode = "static";
    label.cursor = "pointer";
    label.on("pointertap", onTap);
  }
  return label;
}

function buildIslandParts(
  island: IslandModel,
  retentionByNode: ReadonlyMap<string, number>,
  onFly: (request: FlyRequest) => void,
  parts: {
    terrain: Container;
    kingdomContent: Container;
    villageContent: Container;
    geoLabels: Container;
    kingdomLabels: Container;
    villageLabels: Container;
  },
): void {
  parts.terrain.addChild(drawIslandTerrain(island));

  const borders = new Graphics();
  for (const path of island.kingdomBorderPaths) {
    strokeDashedPath(borders, path, 6, 5, { width: 1.4, color: mapTheme.inkSoft, alpha: 0.85 });
  }
  parts.kingdomContent.addChild(borders);

  const islandDim = labelDim(averageRetention(island.memberNodeIds, retentionByNode));
  const islandLabel = makeLabel(island.label, mapTheme.labelSizes.island, islandDim, () =>
    onFly({ position: island.center, scale: 1.0 }),
  );
  islandLabel.position.set(island.center.x, island.center.y - island.radius - 28);
  parts.geoLabels.addChild(islandLabel);

  const villageDots = new Graphics();
  const villageGlyphs = new Graphics();
  const pointDots = new Graphics();

  for (const kingdom of island.kingdoms) {
    const kingdomDim = labelDim(averageRetention(kingdom.memberNodeIds, retentionByNode));
    const kingdomLabel = makeLabel(kingdom.label, mapTheme.labelSizes.kingdom, kingdomDim);
    kingdomLabel.position.set(kingdom.labelPosition.x, kingdom.labelPosition.y);
    parts.kingdomLabels.addChild(kingdomLabel);

    for (const village of kingdom.villages) {
      villageDots.circle(village.position.x, village.position.y, 2.2);
      drawHouseCluster(villageGlyphs, village.position, village.tier);

      const villageDim = labelDim(averageRetention(village.memberNodeIds, retentionByNode));
      const villageLabel = makeLabel(village.label, mapTheme.labelSizes.village, villageDim, () =>
        onFly({ position: village.position, scale: 3.0 }),
      );
      villageLabel.position.set(village.position.x, village.position.y + 15);
      parts.villageLabels.addChild(villageLabel);

      for (const point of village.points) {
        pointDots.circle(point.position.x, point.position.y, 1.5);
        const pointDim = labelDim(retentionByNode.get(point.nodeId) ?? 1);
        const pointLabel = makeLabel(point.label, mapTheme.labelSizes.point, 0.9 * pointDim);
        pointLabel.anchor.set(0, 0.5);
        pointLabel.position.set(point.position.x + 4, point.position.y);
        parts.villageLabels.addChild(pointLabel);
      }
    }
  }
  villageDots.fill({ color: mapTheme.ink, alpha: 0.8 });
  pointDots.fill({ color: mapTheme.inkSoft, alpha: 0.9 });
  parts.kingdomContent.addChild(villageDots);
  parts.villageContent.addChild(villageGlyphs);
  parts.villageContent.addChild(pointDots);
}

export function buildWorldScene(
  world: WorldModel,
  retentionByNode: ReadonlyMap<string, number>,
  onFly: (request: FlyRequest) => void,
): WorldScene {
  const parts = {
    terrain: new Container(),
    kingdomContent: new Container(),
    villageContent: new Container(),
    geoLabels: new Container(),
    kingdomLabels: new Container(),
    villageLabels: new Container(),
  };
  for (const island of world.islands) {
    buildIslandParts(island, retentionByNode, onFly, parts);
  }
  const fog = buildFogLayer(world, retentionByNode);

  const root = new Container();
  // Fog sits above all drawn content but below every name — names stay readable.
  root.addChild(
    parts.terrain,
    parts.kingdomContent,
    parts.villageContent,
    fog,
    parts.kingdomLabels,
    parts.villageLabels,
    parts.geoLabels,
  );
  return {
    root,
    geoParts: [parts.geoLabels],
    kingdomParts: [parts.kingdomContent, parts.kingdomLabels],
    villageParts: [parts.villageContent, parts.villageLabels],
  };
}
