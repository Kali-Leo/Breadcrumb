/**
 * Purpose: the village level — founder-picked case #5: an elevation-view gallery of
 * official Nortantis building illustrations. The village seat stands large on the
 * left; every knowledge point is a building with a name plate along an official-style
 * road winding to the right. Retention gently dims what is fading.
 * Main exports: buildTownScene.
 */
import {
  averageRetention,
  createSeededRandom,
  hashStringToSeed,
  type VillageModel,
} from "@breadcrumb/plugin-map";
import { Container, Graphics, Sprite, Text, TextStyle, type Texture } from "pixi.js";
import type { MapArt } from "./mapArtAssets";
import { labelDim } from "./mapLabels";
import { mapTheme } from "./mapTheme";

/** Official TownGeneratorOS ANCIENT palette for the village interior. */
const PALETTE = { paper: 0xccc5a3, medium: 0x806f4d, dark: 0x342414 } as const;

function roadPoint(t: number, width: number, height: number): { x: number; y: number } {
  // A gentle S-curve across the lower half of the scene.
  const x = width * (0.12 + t * 0.78);
  const y = height * (0.62 + 0.13 * Math.sin(t * Math.PI * 1.6));
  return { x, y };
}

/** Official road look: pale core inside a darker edge (TownGeneratorOS CityMap). */
function drawRoad(graphics: Graphics, width: number, height: number): void {
  for (const pass of [
    { lineWidth: 26, color: PALETTE.medium, alpha: 0.5 },
    { lineWidth: 18, color: PALETTE.paper, alpha: 1 },
  ]) {
    const start = roadPoint(0, width, height);
    graphics.moveTo(start.x, start.y);
    for (let step = 1; step <= 40; step += 1) {
      const point = roadPoint(step / 40, width, height);
      graphics.lineTo(point.x, point.y);
    }
    graphics.stroke({ width: pass.lineWidth, color: pass.color, alpha: pass.alpha, cap: "round" });
  }
}

function plate(text: string, fontSize: number, alpha: number): Text {
  const label = new Text({
    text,
    style: new TextStyle({
      fontFamily: mapTheme.fontFamily,
      fontSize: fontSize * 2,
      fill: PALETTE.dark,
      letterSpacing: 2,
      stroke: { color: PALETTE.paper, width: 5, join: "round" },
    }),
  });
  label.scale.set(0.5);
  label.anchor.set(0.5, 0);
  label.alpha = alpha;
  return label;
}

function placeBuilding(
  container: Container,
  texture: Texture,
  x: number,
  y: number,
  targetHeight: number,
  alpha: number,
): void {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, 1);
  const scale = targetHeight / Math.max(texture.height, 1);
  sprite.scale.set(scale);
  sprite.position.set(x, y);
  sprite.alpha = alpha;
  sprite.zIndex = y;
  container.addChild(sprite);
}

export function buildTownScene(
  village: VillageModel,
  screenWidth: number,
  screenHeight: number,
  art: MapArt,
  retentionByNode: ReadonlyMap<string, number>,
): Container {
  const scene = new Container();
  const background = new Graphics();
  background.rect(0, 0, screenWidth, screenHeight).fill({ color: PALETTE.paper });
  scene.addChild(background);

  const ground = new Graphics();
  drawRoad(ground, screenWidth, screenHeight);
  scene.addChild(ground);

  const buildingsLayer = new Container();
  buildingsLayer.sortableChildren = true;
  scene.addChild(buildingsLayer);
  const random = createSeededRandom(hashStringToSeed(village.nodeId));

  // The village's own seat, standing large on the left.
  const seatTexture = art.settlementByTier[village.tier - 1];
  const seatDim = labelDim(averageRetention(village.memberNodeIds, retentionByNode));
  if (seatTexture !== undefined) {
    const seatBase = roadPoint(0.02, screenWidth, screenHeight);
    placeBuilding(
      buildingsLayer,
      seatTexture,
      seatBase.x + screenWidth * 0.02,
      seatBase.y - screenHeight * 0.02,
      screenHeight * 0.3,
      seatDim,
    );
  }

  // One building per knowledge point along the road, alternating sides.
  const pointCount = village.points.length;
  const baseHeight = Math.min(screenHeight * 0.17, (screenWidth * 0.72) / Math.max(pointCount, 4));
  village.points.forEach((point, index) => {
    const t = (index + 1) / (pointCount + 1);
    const base = roadPoint(t, screenWidth, screenHeight);
    const side = index % 2 === 0 ? -1 : 1;
    const x = base.x + (random() - 0.5) * 20;
    const y = base.y + side * (14 + random() * 10);
    const texture = art.buildings[hashStringToSeed(point.nodeId) % art.buildings.length];
    if (texture === undefined) return;
    const dim = labelDim(retentionByNode.get(point.nodeId) ?? 1);
    const buildingHeight = baseHeight * (0.85 + random() * 0.3);
    placeBuilding(buildingsLayer, texture, x, y, buildingHeight, dim);
    const nameplate = plate(point.label, 15, dim);
    nameplate.position.set(x, y + 6);
    nameplate.zIndex = y + 1;
    buildingsLayer.addChild(nameplate);
  });

  const title = new Text({
    text: village.label,
    style: new TextStyle({
      fontFamily: mapTheme.fontFamily,
      fontSize: 30,
      fill: PALETTE.dark,
      letterSpacing: 4,
    }),
  });
  title.anchor.set(0.5, 0);
  title.position.set(screenWidth / 2, 26);
  scene.addChild(title);
  return scene;
}
