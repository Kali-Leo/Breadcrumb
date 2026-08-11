/**
 * Purpose: the Nortantis sea decorations (AGPL-3.0, see THIRD_PARTY_NOTICES.md) — a compass
 * rose anchored in the frame's bottom-right corner plus a serpent, an octopus and a ship
 * dropped into open water by the same deterministic rejection sampling the islets use.
 * Main exports: buildSeaDecorLayer.
 */
import {
  createSeededRandom,
  findOpenSeaPoint,
  hashStringToSeed,
  type SeaObstacle,
  type WorldModel,
  type WorldPoint,
} from "@breadcrumb/plugin-map";
import { Container, Sprite, type Texture } from "pixi.js";
import type { MapArt } from "./mapArtAssets";
import { worldBounds } from "./seaArt";

const DECOR_ALPHA = 0.85;
const COMPASS_WIDTH = 150;
const COMPASS_INSET = 60;
/** The rose owns its corner — pieces keep out of this circle around it. */
const COMPASS_CLEARANCE = 200;
const FRAME_INSET = 90;
const LAND_CLEARANCE_FACTOR = 1.35;
const LAND_CLEARANCE_PADDING = 140;
const PIECE_MUTUAL_CLEARANCE = 260;
const PLACEMENT_ATTEMPTS = 80;

/** Uniform scale keeps every piece's drawn proportions. */
function addSprite(
  layer: Container,
  texture: Texture,
  center: WorldPoint,
  width: number,
  anchorX: number,
  anchorY: number,
): void {
  const sprite = new Sprite(texture);
  sprite.anchor.set(anchorX, anchorY);
  sprite.scale.set(width / Math.max(texture.width, 1));
  sprite.alpha = DECOR_ALPHA;
  sprite.position.set(center.x, center.y);
  layer.addChild(sprite);
}

function landObstacles(world: WorldModel): SeaObstacle[] {
  return [...world.islands, ...world.islets].map((landmass) => ({
    center: landmass.center,
    clearance: landmass.radius * LAND_CLEARANCE_FACTOR + LAND_CLEARANCE_PADDING,
  }));
}

export function buildSeaDecorLayer(world: WorldModel, art: MapArt): Container {
  const layer = new Container();
  const bounds = worldBounds(world);
  const compassCorner: WorldPoint = {
    x: bounds.maxX - COMPASS_INSET,
    y: bounds.maxY - COMPASS_INSET,
  };
  addSprite(layer, art.decor.compassRose, compassCorner, COMPASS_WIDTH, 1, 1);

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
    { texture: art.decor.seaSerpent, width: 110 },
    { texture: art.decor.octopus, width: 90 },
    { texture: art.decor.ship, width: 100 },
  ];
  for (const piece of pieces) {
    // Decor is optional filler: a crowded sea simply gets fewer pieces, never a stranded one.
    const center = findOpenSeaPoint(random, box, obstacles, PLACEMENT_ATTEMPTS);
    if (center === null) continue;
    obstacles.push({ center, clearance: PIECE_MUTUAL_CLEARANCE });
    addSprite(layer, piece.texture, center, piece.width, 0.5, 0.5);
  }
  return layer;
}
