/**
 * Purpose: draws what one island shows at its own level — a seat building per kingdom plus
 * its name, placed by mapKingdomLabels so realm names never land on a seat or each other.
 * Village settlements, village names and knowledge-point labels were removed 2026-08-11
 * (backup: branch backup/village-town-scene).
 * Main exports: drawIslandSettlements, SettlementsInput, stampSprite.
 */
import { averageRetention, type IslandModel, type WorldPoint } from "@breadcrumb/plugin-map";
import { Container, Sprite, type Texture } from "pixi.js";
import type { MapArt } from "./mapArtAssets";
import { type KingdomLabelRequest, placeKingdomLabels } from "./mapKingdomLabels";
import { labelDim, type MapLabel, makeMapLabel } from "./mapLabels";
import { mapTheme } from "./mapTheme";

/** Realm names are set a touch looser than body text, matching the island names. */
const KINGDOM_LETTER_SPACING = 0.18;

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

export interface SettlementsInput {
  island: IslandModel;
  retentionByNode: ReadonlyMap<string, number>;
  art: MapArt;
  newNodeIds: ReadonlySet<string>;
  islandBand: Container;
  /** Camera scale of this island's own level — where its realm names are read. */
  islandScale: number;
  labels: MapLabel[];
  reveal: (object: Container) => void;
}

export function drawIslandSettlements(input: SettlementsInput): void {
  const { island, retentionByNode, art, newNodeIds, islandBand, labels, reveal } = input;
  const requests: KingdomLabelRequest[] = island.kingdoms.map((kingdom) => ({
    nodeId: kingdom.nodeId,
    content: kingdom.label,
    anchor: kingdom.labelPosition,
    letterSpacingRatio: KINGDOM_LETTER_SPACING,
    priority: kingdom.memberNodeIds.length,
  }));
  const positions = placeKingdomLabels(requests, mapTheme.labelSizes.kingdom, input.islandScale);

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
    const kingdomLabel = makeMapLabel(
      kingdom.nodeId,
      kingdom.label,
      mapTheme.labelSizes.kingdom,
      kingdomDim,
      {
        letterSpacingRatio: KINGDOM_LETTER_SPACING,
      },
    );
    const position = positions.get(kingdom.nodeId) ?? kingdom.labelPosition;
    kingdomLabel.text.position.set(position.x, position.y);
    islandBand.addChild(kingdomLabel.text);
    labels.push(kingdomLabel);
    if (newNodeIds.has(kingdom.nodeId)) reveal(kingdomLabel.text);
  }
}
