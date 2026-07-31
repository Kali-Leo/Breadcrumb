/**
 * Purpose: the fog of forgetting — soft white breath over places whose retention has
 * faded (spec 007). Pure atmosphere: no numbers, and it sits below every label layer
 * so names stay readable.
 * Main exports: buildFogLayer.
 */
import { averageRetention, type WorldModel } from "@breadcrumb/plugin-map";
import { BlurFilter, Container, Graphics } from "pixi.js";
import { mapTheme } from "./mapTheme";

const ISLAND_FOG_STRENGTH = 0.35;
const KINGDOM_FOG_STRENGTH = 0.3;
const VILLAGE_FOG_STRENGTH = 0.5;
/** Below this alpha a blob is invisible anyway — skip the geometry. */
const MINIMUM_VISIBLE_ALPHA = 0.02;

export function buildFogLayer(
  world: WorldModel,
  retentionByNode: ReadonlyMap<string, number>,
): Container {
  const layer = new Container();
  const graphics = new Graphics();

  for (const island of world.islands) {
    const islandAlpha =
      (1 - averageRetention(island.memberNodeIds, retentionByNode)) * ISLAND_FOG_STRENGTH;
    if (islandAlpha > MINIMUM_VISIBLE_ALPHA) {
      graphics
        .circle(island.center.x, island.center.y, island.radius * 0.85)
        .fill({ color: mapTheme.fog, alpha: islandAlpha });
    }
    for (const kingdom of island.kingdoms) {
      const kingdomAlpha =
        (1 - averageRetention(kingdom.memberNodeIds, retentionByNode)) * KINGDOM_FOG_STRENGTH;
      if (kingdomAlpha > MINIMUM_VISIBLE_ALPHA) {
        graphics
          .circle(kingdom.labelPosition.x, kingdom.labelPosition.y, 55)
          .fill({ color: mapTheme.fog, alpha: kingdomAlpha });
      }
      for (const village of kingdom.villages) {
        const villageAlpha =
          (1 - averageRetention(village.memberNodeIds, retentionByNode)) * VILLAGE_FOG_STRENGTH;
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
