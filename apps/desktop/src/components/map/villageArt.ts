/**
 * Purpose: renders a settlement's ink-line micro-plan (ported TownGenerator data) at
 * the village anchor — streets, building footprints, walls and gates, scaled by tier.
 * Main exports: buildVillagePlan.
 */
import { hashStringToSeed, type VillageModel } from "@breadcrumb/plugin-map";
import { generateTown, type TownPlan } from "@breadcrumb/plugin-town";
import { Container, Graphics } from "pixi.js";
import { mapTheme } from "./mapTheme";

const N_PATCHES_BY_TIER = [4, 8, 15, 24] as const;
/** Footprint radius of the plan in world units per tier. */
const PLAN_RADIUS_BY_TIER = [22, 34, 52, 72] as const;

const planCache = new Map<string, TownPlan>();

function planFor(village: VillageModel): TownPlan {
  const key = `${village.nodeId}:${village.tier}`;
  const cached = planCache.get(key);
  if (cached !== undefined) return cached;
  const plan = generateTown(
    hashStringToSeed(village.nodeId),
    N_PATCHES_BY_TIER[village.tier - 1] ?? 8,
  );
  if (planCache.size > 128) planCache.clear();
  planCache.set(key, plan);
  return plan;
}

/** Draws one village's town plan centred on its anchor. */
export function buildVillagePlan(village: VillageModel): Container {
  const plan = planFor(village);
  const holder = new Container();
  const graphics = new Graphics();
  holder.addChild(graphics);
  const scale = (PLAN_RADIUS_BY_TIER[village.tier - 1] ?? 34) / Math.max(plan.cityRadius, 1);
  const toWorld = (point: { x: number; y: number }) => ({
    x: village.position.x + point.x * scale,
    y: village.position.y + point.y * scale,
  });

  for (const street of plan.streets) {
    const path = street.map(toWorld);
    const first = path.at(0);
    if (first === undefined) continue;
    graphics.moveTo(first.x, first.y);
    for (const point of path.slice(1)) graphics.lineTo(point.x, point.y);
    graphics.stroke({ width: 1.6, color: 0xb0996e, alpha: 0.75, cap: "round", join: "round" });
  }

  for (const patch of plan.patches) {
    if (!patch.withinCity) continue;
    for (const building of patch.buildings) {
      graphics
        .poly(building.map(toWorld), true)
        .fill({ color: 0xfbf6ea, alpha: 0.95 })
        .stroke({ width: 0.7, color: mapTheme.ink, alpha: 0.9, join: "round" });
    }
  }

  if (plan.wall.length > 2) {
    graphics
      .poly(plan.wall.map(toWorld), true)
      .stroke({ width: 2.4, color: mapTheme.ink, alpha: 0.95, join: "round" });
    for (const gate of plan.gates) {
      const at = toWorld(gate);
      graphics.circle(at.x, at.y, 1.8).fill({ color: mapTheme.ink, alpha: 0.9 });
    }
  }
  return holder;
}
