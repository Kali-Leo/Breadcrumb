/**
 * Purpose: the fog of forgetting — soft white breath over places whose retention has
 * faded (spec 007). Pure atmosphere: no numbers, and it sits below every label layer
 * so names stay readable.
 * Main exports: buildFogLayer, fadeOf.
 */
import { averageRetention, type WorldModel } from "@breadcrumb/feature-map";
import { BlurFilter, Container, Graphics } from "pixi.js";
import { mapTheme } from "./mapTheme";

const ISLAND_FOG_STRENGTH = 0.35;
const KINGDOM_FOG_STRENGTH = 0.3;
const VILLAGE_FOG_STRENGTH = 0.5;
/** Below this alpha a blob is invisible anyway — skip the geometry. */
const MINIMUM_VISIBLE_ALPHA = 0.02;

/**
 * The retention a place is treated as fully faded at. FSRS retrievability does not fall to
 * zero: a concept met a handful of times and then left for a year still reads around 0.46,
 * so `1 − R` never got past ~0.54 and the thickest fog this map could draw was alpha 0.19 —
 * invisible in practice, and spec 007's own acceptance test ("age the footprints, the region
 * fogs over") could not pass (audit 2026-08-28, 记忆与遗忘 #4). Rescaling the range that
 * actually occurs onto the full strength is a display fix; the memory model is untouched.
 */
const FULLY_FADED_RETENTION = 0.45;

/** How faded a place looks, 0 (fresh) to 1 (as faded as this map ever draws). */
export function fadeOf(retention: number): number {
  const faded = (1 - retention) / (1 - FULLY_FADED_RETENTION);
  return Math.min(1, Math.max(0, faded));
}

export function buildFogLayer(
  world: WorldModel,
  retentionByNode: ReadonlyMap<string, number>,
): Container {
  const layer = new Container();
  const graphics = new Graphics();

  for (const island of world.islands) {
    const islandAlpha =
      fadeOf(averageRetention(island.memberNodeIds, retentionByNode)) * ISLAND_FOG_STRENGTH;
    if (islandAlpha > MINIMUM_VISIBLE_ALPHA) {
      graphics
        .circle(island.center.x, island.center.y, island.radius * 0.85)
        .fill({ color: mapTheme.fog, alpha: islandAlpha });
    }
    for (const kingdom of island.kingdoms) {
      const kingdomAlpha =
        fadeOf(averageRetention(kingdom.memberNodeIds, retentionByNode)) * KINGDOM_FOG_STRENGTH;
      if (kingdomAlpha > MINIMUM_VISIBLE_ALPHA) {
        graphics
          .circle(kingdom.labelPosition.x, kingdom.labelPosition.y, 55)
          .fill({ color: mapTheme.fog, alpha: kingdomAlpha });
      }
      for (const village of kingdom.villages) {
        const villageAlpha =
          fadeOf(averageRetention(village.memberNodeIds, retentionByNode)) * VILLAGE_FOG_STRENGTH;
        if (villageAlpha > MINIMUM_VISIBLE_ALPHA) {
          graphics
            .circle(village.position.x, village.position.y, 26 + village.tier * 7)
            .fill({ color: mapTheme.fog, alpha: villageAlpha });
        }
      }
    }
  }

  layer.addChild(graphics);
  layer.filters = [new BlurFilter({ strength: 14 })];
  return layer;
}
