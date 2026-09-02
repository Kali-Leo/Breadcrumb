/**
 * Purpose: the Nortantis sea decorations (AGPL-3.0, see THIRD_PARTY_NOTICES.md) — a compass
 * rose anchored in the frame's bottom-right corner plus a serpent, an octopus and a ship
 * dropped into open water by the same deterministic rejection sampling the islets use.
 * Planning is split from drawing so island names can dodge the pieces (mapLabelPlacement).
 * Main exports: planSeaDecor, buildSeaDecorLayer, seaDecorObstacles, SeaDecorPiece.
 */
import {
  createSeededRandom,
  findOpenSeaPoint,
  hashStringToSeed,
  type SeaObstacle,
  type WorldModel,
  type WorldPoint,
} from "@breadcrumb/feature-map";
import { Container, Sprite, type Texture } from "pixi.js";
import type { MapArt } from "./mapArtAssets";
import type { LabelBox } from "./mapLabelPlacement";
import { worldBounds } from "./seaArt";

const DECOR_ALPHA = 0.9;
const COMPASS_WIDTH = 200;
const COMPASS_INSET = 60;
/** The rose owns its corner — pieces keep out of this circle around it. */
const COMPASS_CLEARANCE = 260;
const FRAME_INSET = 90;
const LAND_CLEARANCE_FACTOR = 1.35;
const LAND_CLEARANCE_PADDING = 140;
const PIECE_MUTUAL_CLEARANCE = 260;
const PLACEMENT_ATTEMPTS = 80;

/** One planned piece: where it will be drawn plus the box it will occupy. */
export interface SeaDecorPiece {
  texture: Texture;
  /** The sprite's anchor point in world units. */
  position: WorldPoint;
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
  /** Centre of the drawn box — what a name has to keep clear of. */
  boxCenter: WorldPoint;
}

/** Uniform scale keeps every piece's drawn proportions. */
function planPiece(
  texture: Texture,
  position: WorldPoint,
  width: number,
  anchorX: number,
  anchorY: number,
): SeaDecorPiece {
  const height = (width / Math.max(texture.width, 1)) * Math.max(texture.height, 1);
  return {
    texture,
    position,
    anchorX,
    anchorY,
    width,
    height,
    boxCenter: {
      x: position.x + (0.5 - anchorX) * width,
      y: position.y + (0.5 - anchorY) * height,
    },
  };
}

function landObstacles(world: WorldModel): SeaObstacle[] {
  return [...world.islands, ...world.islets].map((landmass) => ({
    center: landmass.center,
    clearance: landmass.radius * LAND_CLEARANCE_FACTOR + LAND_CLEARANCE_PADDING,
  }));
}

/** Decides where every piece goes; drawing and label dodging both read this one plan. */
export function planSeaDecor(world: WorldModel, art: MapArt): SeaDecorPiece[] {
  const bounds = worldBounds(world);
  const compassCorner: WorldPoint = {
    x: bounds.maxX - COMPASS_INSET,
    y: bounds.maxY - COMPASS_INSET,
  };
  const planned = [planPiece(art.decor.compassRose, compassCorner, COMPASS_WIDTH, 1, 1)];

  const random = createSeededRandom(
    hashStringToSeed(
      world.islands
        .map((island) => island.nodeId)
        .sort()
        .join(","),
    ),
  );
  const box = {
    minX: bounds.minX + FRAME_INSET,
    minY: bounds.minY + FRAME_INSET,
    maxX: bounds.maxX - FRAME_INSET,
    maxY: bounds.maxY - FRAME_INSET,
  };
  const obstacles: SeaObstacle[] = [
    ...landObstacles(world),
    // The compass sits at its corner's anchor point, so its clearance hangs off that.
    { center: compassCorner, clearance: COMPASS_CLEARANCE },
  ];

  const pieces: { texture: Texture; width: number }[] = [
    { texture: art.decor.seaSerpent, width: 170 },
    { texture: art.decor.octopus, width: 140 },
    { texture: art.decor.ship, width: 160 },
  ];
  for (const piece of pieces) {
    // Decor is optional filler: a crowded sea simply gets fewer pieces, never a stranded one.
    const center = findOpenSeaPoint(random, box, obstacles, PLACEMENT_ATTEMPTS);
    if (center === null) continue;
    obstacles.push({ center, clearance: PIECE_MUTUAL_CLEARANCE });
    planned.push(planPiece(piece.texture, center, piece.width, 0.5, 0.5));
  }
  return planned;
}

/** The boxes the drawn pieces occupy — what an island name has to keep clear of. */
export function seaDecorObstacles(pieces: readonly SeaDecorPiece[]): LabelBox[] {
  return pieces.map((piece) => ({
    center: piece.boxCenter,
    width: piece.width,
    height: piece.height,
  }));
}

export function buildSeaDecorLayer(pieces: readonly SeaDecorPiece[]): Container {
  const layer = new Container();
  for (const piece of pieces) {
    const sprite = new Sprite(piece.texture);
    sprite.anchor.set(piece.anchorX, piece.anchorY);
    sprite.scale.set(piece.width / Math.max(piece.texture.width, 1));
    sprite.alpha = DECOR_ALPHA;
    sprite.position.set(piece.position.x, piece.position.y);
    layer.addChild(sprite);
  }
  return layer;
}
