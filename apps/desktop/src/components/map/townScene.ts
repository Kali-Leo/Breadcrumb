/**
 * Purpose: the village level — a full-window town scene reproducing TownGeneratorOS's
 * official CityMap renderer (ANCIENT palette): outlined roads, light buildings with
 * dark outlines, park groves, wall with towers and gates. Knowledge points label the
 * largest buildings.
 * Main exports: buildTownScene.
 */
import { hashStringToSeed, type VillageModel } from "@breadcrumb/plugin-map";
import { generateTown, type TownPlan, type TownPoint } from "@breadcrumb/plugin-town";
import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { mapTheme } from "./mapTheme";

/** Official palette: TownGeneratorOS Palette.ANCIENT. */
const PALETTE = { paper: 0xccc5a3, light: 0xa69974, medium: 0x806f4d, dark: 0x342414 } as const;
/** Official stroke constants: Ward.MAIN_STREET, Brush.NORMAL/THICK_STROKE. */
const MAIN_STREET = 2.0;
const NORMAL_STROKE = 0.3;
const THICK_STROKE = 1.8;
const N_PATCHES_BY_TIER = [4, 8, 15, 24] as const;

const planCache = new Map<string, TownPlan>();

function planFor(village: VillageModel): TownPlan {
  const key = `${village.nodeId}:${village.tier}`;
  const cached = planCache.get(key);
  if (cached !== undefined) return cached;
  const plan = generateTown(
    hashStringToSeed(village.nodeId),
    N_PATCHES_BY_TIER[village.tier - 1] ?? 8,
  );
  if (planCache.size > 64) planCache.clear();
  planCache.set(key, plan);
  return plan;
}

function drawRoad(graphics: Graphics, road: readonly TownPoint[]): void {
  const first = road.at(0);
  if (first === undefined) return;
  for (const pass of [
    { width: MAIN_STREET + NORMAL_STROKE, color: PALETTE.medium },
    { width: MAIN_STREET - NORMAL_STROKE, color: PALETTE.paper },
  ]) {
    graphics.moveTo(first.x, first.y);
    for (const point of road.slice(1)) graphics.lineTo(point.x, point.y);
    graphics.stroke({ width: pass.width, color: pass.color, cap: "butt", join: "round" });
  }
}

function drawBuildings(
  graphics: Graphics,
  blocks: readonly TownPoint[][],
  strokeWidth: number,
): void {
  for (const block of blocks) {
    graphics.poly([...block], true).stroke({ width: strokeWidth * 2, color: PALETTE.dark });
  }
  for (const block of blocks) {
    graphics.poly([...block], true).fill({ color: PALETTE.light });
  }
}

function drawWall(graphics: Graphics, plan: TownPlan): void {
  if (plan.wall.length < 3) return;
  graphics.poly([...plan.wall], true).stroke({ width: THICK_STROKE, color: PALETTE.dark });
  for (const gate of plan.gates) {
    const index = plan.wall.findIndex(
      (point) => Math.hypot(point.x - gate.x, point.y - gate.y) < 0.01,
    );
    if (index >= 0) {
      const next = plan.wall[(index + 1) % plan.wall.length];
      const previous = plan.wall[(index - 1 + plan.wall.length) % plan.wall.length];
      if (next !== undefined && previous !== undefined) {
        const dirLength = Math.hypot(next.x - previous.x, next.y - previous.y) || 1;
        const dx = ((next.x - previous.x) / dirLength) * THICK_STROKE * 1.5;
        const dy = ((next.y - previous.y) / dirLength) * THICK_STROKE * 1.5;
        graphics.moveTo(gate.x - dx, gate.y - dy);
        graphics.lineTo(gate.x + dx, gate.y + dy);
        graphics.stroke({ width: THICK_STROKE * 2, color: PALETTE.dark, cap: "butt" });
      }
    }
  }
  for (const tower of plan.towers) {
    graphics.circle(tower.x, tower.y, THICK_STROKE).fill({ color: PALETTE.dark });
  }
}

/** Knowledge points caption the largest buildings, walking outward from the centre. */
function labelKnowledgePoints(town: Container, village: VillageModel, plan: TownPlan): void {
  const buildings = plan.patches
    .filter((patch) => patch.withinCity)
    .flatMap((patch) => patch.buildings)
    .map((block) => {
      let area = 0;
      let sumX = 0;
      let sumY = 0;
      for (let index = 0; index < block.length; index += 1) {
        const a = block[index];
        const b = block[(index + 1) % block.length];
        if (a === undefined || b === undefined) continue;
        area += a.x * b.y - b.x * a.y;
        sumX += a.x;
        sumY += a.y;
      }
      return {
        area: Math.abs(area) / 2,
        x: sumX / Math.max(block.length, 1),
        y: sumY / Math.max(block.length, 1),
      };
    })
    .sort((a, b) => b.area - a.area);
  village.points.forEach((point, index) => {
    const building = buildings[index];
    if (building === undefined) return;
    const label = new Text({
      text: point.label,
      style: new TextStyle({
        fontFamily: mapTheme.fontFamily,
        fontSize: 10,
        fill: PALETTE.dark,
        fontStyle: "italic",
        stroke: { color: PALETTE.paper, width: 3, join: "round" },
      }),
    });
    label.anchor.set(0.5, 0);
    label.position.set(building.x, building.y + 2);
    label.scale.set(0.32);
    town.addChild(label);
  });
}

export function buildTownScene(
  village: VillageModel,
  screenWidth: number,
  screenHeight: number,
): Container {
  const plan = planFor(village);
  const scene = new Container();
  const background = new Graphics();
  background.rect(0, 0, screenWidth, screenHeight).fill({ color: PALETTE.paper });
  scene.addChild(background);

  const town = new Container();
  const graphics = new Graphics();
  town.addChild(graphics);

  for (const road of plan.roads) drawRoad(graphics, road);
  for (const patch of plan.patches) {
    if (patch.wardLabel === null) continue;
    if (patch.wardLabel === "Park") {
      for (const grove of patch.buildings) {
        graphics.poly([...grove], true).fill({ color: PALETTE.medium });
      }
    } else if (patch.wardLabel === "Castle") {
      drawBuildings(graphics, patch.buildings, NORMAL_STROKE * 2);
    } else {
      drawBuildings(graphics, patch.buildings, NORMAL_STROKE);
    }
  }
  drawWall(graphics, plan);
  labelKnowledgePoints(town, village, plan);

  const reach = Math.max(plan.cityRadius * 1.25, 24);
  const scale = (Math.min(screenWidth, screenHeight) * 0.82) / (reach * 2);
  town.scale.set(scale);
  town.position.set(screenWidth / 2, screenHeight / 2);
  scene.addChild(town);

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
