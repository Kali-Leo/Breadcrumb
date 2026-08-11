/**
 * Purpose: draws what lives on one island — kingdom seats and names, settlement icons,
 * village names and knowledge-point labels — into the island and kingdom bands.
 * Main exports: drawIslandSettlements, stampSprite, TapTarget.
 */
import { averageRetention, type IslandModel, type WorldPoint } from "@breadcrumb/plugin-map";
import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { MapArt } from "./mapArtAssets";
import { type LabelSets, labelDim, makeLabel } from "./mapLabels";
import { mapTheme } from "./mapTheme";

export interface TapTarget {
  kind: "island" | "village";
  nodeId: string;
}

export interface SettlementBands {
  islandBand: Container;
  kingdomBand: Container;
}

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

export function drawIslandSettlements(
  island: IslandModel,
  retentionByNode: ReadonlyMap<string, number>,
  art: MapArt,
  newNodeIds: ReadonlySet<string>,
  onTap: (target: TapTarget) => void,
  bands: SettlementBands,
  labelSets: LabelSets,
  reveal: (object: Container) => void,
): void {
  const pointDots = new Graphics();
  for (const kingdom of island.kingdoms) {
    const kingdomDim = labelDim(averageRetention(kingdom.memberNodeIds, retentionByNode));
    // Every realm gets one large seat building; its grandeur tracks knowledge size.
    const seatTexture = seatTextureFor(art, kingdom.memberNodeIds.length);
    if (seatTexture !== undefined) {
      const seat = new Container();
      stampSprite(seat, seatTexture, kingdom.labelPosition, 70 + kingdom.memberNodeIds.length * 3);
      seat.alpha = kingdomDim;
      bands.islandBand.addChild(seat);
    }
    const kingdomLabel = makeLabel(kingdom.label, mapTheme.labelSizes.kingdom, kingdomDim, {
      letterSpacing: 3,
    });
    kingdomLabel.position.set(kingdom.labelPosition.x, kingdom.labelPosition.y + 22);
    bands.islandBand.addChild(kingdomLabel);
    labelSets.kingdomLabels.push(kingdomLabel);

    for (const village of kingdom.villages) {
      // Settlement grows with knowledge: farm -> village -> town -> walled city.
      const settlementTexture = art.settlementByTier[village.tier - 1];
      if (settlementTexture !== undefined) {
        const iconHolder = new Container();
        stampSprite(iconHolder, settlementTexture, village.position, 15 + village.tier * 5);
        bands.kingdomBand.addChild(iconHolder);
        if (newNodeIds.has(village.nodeId)) reveal(iconHolder);
      }
      const villageDim = labelDim(averageRetention(village.memberNodeIds, retentionByNode));
      const villageLabel = makeLabel(village.label, mapTheme.labelSizes.village, villageDim, {
        letterSpacing: 1,
        onTap: () => onTap({ kind: "village", nodeId: village.nodeId }),
      });
      villageLabel.position.set(village.position.x, village.position.y + 20);
      bands.kingdomBand.addChild(villageLabel);
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
        bands.kingdomBand.addChild(pointLabel);
        labelSets.pointLabels.push(pointLabel);
        if (newNodeIds.has(point.nodeId)) reveal(pointLabel);
      }
    }
  }
  pointDots.fill({ color: mapTheme.inkSoft, alpha: 0.9 });
  bands.kingdomBand.addChild(pointDots);
}
