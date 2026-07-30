/**
 * Purpose: stamps Nortantis hand-drawn relief icons over an island — one coherent
 * mountain/hill drawing series per island, woods in moist lowlands — painter-ordered
 * (lower stamps overlap higher ones) like a real chart engraver would.
 * Main exports: buildIslandRelief, stampSprite.
 */
import {
  createSeededRandom,
  hashStringToSeed,
  type IslandModel,
  type SeededRandom,
  type WorldPoint,
} from "@breadcrumb/plugin-map";
import { Container, Sprite, type Texture } from "pixi.js";

const MOUNTAIN_SPACING = 26;
const HILL_SPACING = 18;
const TREE_SPACING = 14;
const SETTLEMENT_CLEARANCE = 26;

export interface IslandRelief {
  /** Mountains and hills — landmarks, visible at every zoom. */
  landmarks: Container;
  /** Woods — detail that fades in past the geographic view. */
  detail: Container;
}

/** Places one art stamp with painter's-order depth (zIndex = ground line y). */
export function stampSprite(
  container: Container,
  texture: Texture,
  position: WorldPoint,
  worldWidth: number,
  flip: boolean,
): void {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, 0.82);
  const scale = worldWidth / Math.max(texture.width, 1);
  sprite.scale.set(flip ? -scale : scale, scale);
  sprite.position.set(position.x, position.y);
  sprite.zIndex = position.y;
  container.addChild(sprite);
}

function pickTexture(textures: readonly Texture[], random: SeededRandom): Texture | null {
  if (textures.length === 0) return null;
  return textures[Math.floor(random() * textures.length)] ?? null;
}

function farFromAll(point: WorldPoint, placed: readonly WorldPoint[], spacing: number): boolean {
  return placed.every((other) => Math.hypot(point.x - other.x, point.y - other.y) >= spacing);
}

export function buildIslandRelief(
  island: IslandModel,
  mountainSeries: Record<"round" | "sharp" | "spire", Texture[]>,
  hillSeries: Record<"round" | "sharp" | "spire", Texture[]>,
  treeTextures: readonly Texture[],
): IslandRelief {
  const landmarks = new Container();
  landmarks.sortableChildren = true;
  const detail = new Container();
  detail.sortableChildren = true;

  const random = createSeededRandom(hashStringToSeed(island.nodeId) ^ 0x51ab);
  // One drawing series per island keeps its range coherent, like a single engraver.
  const seriesNames: ("round" | "sharp" | "spire")[] = ["round", "sharp", "spire"];
  const series = seriesNames[Math.floor(random() * seriesNames.length)] ?? "sharp";
  const mountains = mountainSeries[series];
  const hills = hillSeries[series];

  const settlements = island.kingdoms.flatMap((kingdom) =>
    kingdom.villages.map((village) => village.position),
  );
  const placed: WorldPoint[] = [...settlements];
  const byHeight = [...island.landCells].sort((a, b) => b.height01 - a.height01);

  for (const cell of byHeight) {
    const anchor = {
      x: cell.site.x + (random() - 0.5) * 8,
      y: cell.site.y + (random() - 0.5) * 8,
    };
    if (!farFromAll(anchor, settlements, SETTLEMENT_CLEARANCE)) continue;
    if (cell.height01 >= 0.66) {
      if (farFromAll(anchor, placed, MOUNTAIN_SPACING)) {
        const texture = pickTexture(mountains, random);
        if (texture !== null) {
          stampSprite(landmarks, texture, anchor, 30 + random() * 10, random() < 0.5);
          placed.push(anchor);
        }
      }
    } else if (cell.height01 >= 0.42 && cell.slope01 >= 0.2) {
      if (random() < 0.7 && farFromAll(anchor, placed, HILL_SPACING)) {
        const texture = pickTexture(hills, random);
        if (texture !== null) {
          stampSprite(landmarks, texture, anchor, 16 + random() * 6, random() < 0.5);
          placed.push(anchor);
        }
      }
    } else if (cell.height01 < 0.4 && cell.flux01 < 0.04 && cell.slope01 < 0.45) {
      if (random() < 0.45 && farFromAll(anchor, placed, TREE_SPACING)) {
        const clusterSize = 1 + Math.floor(random() * 3);
        for (let tree = 0; tree < clusterSize; tree += 1) {
          const texture = pickTexture(treeTextures, random);
          if (texture === null) continue;
          stampSprite(
            detail,
            texture,
            { x: anchor.x + (random() - 0.5) * 14, y: anchor.y + (random() - 0.5) * 10 },
            9 + random() * 5,
            random() < 0.5,
          );
        }
        placed.push(anchor);
      }
    }
  }
  return { landmarks, detail };
}
