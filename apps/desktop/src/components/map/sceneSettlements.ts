/**
 * Purpose: draws what one island shows at its own level — a seat building and a fitted
 * name per kingdom, into the island band. Village settlements, village names and
 * knowledge-point labels were removed 2026-08-11 (backup: branch backup/village-town-scene).
 * Main exports: drawIslandSettlements, stampSprite.
 */
import {
  averageRetention,
  type IslandModel,
  type KingdomModel,
  type WorldPoint,
} from "@breadcrumb/plugin-map";
import { Container, Sprite, type Texture } from "pixi.js";
import type { MapArt } from "./mapArtAssets";
import { type FittedLabel, labelDim, makeFittedLabel } from "./mapLabels";
import { mapTheme } from "./mapTheme";

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

/** How wide the realm is on the chart — the room its name has to fit into. */
function kingdomWidth(kingdom: KingdomModel): number {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (const polygon of kingdom.cellPolygons) {
    for (const point of polygon) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
    }
  }
  return Number.isFinite(minX) ? Math.max(maxX - minX, 1) : 300;
}

export function drawIslandSettlements(
  island: IslandModel,
  retentionByNode: ReadonlyMap<string, number>,
  art: MapArt,
  newNodeIds: ReadonlySet<string>,
  islandBand: Container,
  labels: FittedLabel[],
  reveal: (object: Container) => void,
): void {
  for (const kingdom of island.kingdoms) {
    const kingdomDim = labelDim(averageRetention(kingdom.memberNodeIds, retentionByNode));
    // Every realm gets one large seat building; its grandeur tracks knowledge size.
    const seatTexture = seatTextureFor(art, kingdom.memberNodeIds.length);
    if (seatTexture !== undefined) {
      const seat = new Container();
      stampSprite(seat, seatTexture, kingdom.labelPosition, 70 + kingdom.memberNodeIds.length * 3);
      seat.alpha = kingdomDim;
      islandBand.addChild(seat);
      if (newNodeIds.has(kingdom.nodeId)) reveal(seat);
    }
    const kingdomLabel = makeFittedLabel(
      kingdom.label,
      {
        availableWorldWidth: kingdomWidth(kingdom) * 0.9,
        minScreenSize: mapTheme.labelSizes.kingdom.min,
        maxScreenSize: mapTheme.labelSizes.kingdom.max,
      },
      kingdomDim,
      { letterSpacingRatio: 0.18 },
    );
    kingdomLabel.text.position.set(kingdom.labelPosition.x, kingdom.labelPosition.y + 22);
    islandBand.addChild(kingdomLabel.text);
    labels.push(kingdomLabel);
    if (newNodeIds.has(kingdom.nodeId)) reveal(kingdomLabel.text);
  }
}
