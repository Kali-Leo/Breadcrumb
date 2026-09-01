/**
 * Purpose: archipelago layout — deterministic golden-angle greedy packing so the
 * world view reads land-rich (~70% land): each new island slides inward along its
 * ray until it just clears everyone placed before it.
 * Main exports: packIslandCenters, islandRadiusForTier, RADIUS_BY_TIER.
 */
import type { WorldPoint } from "./types";

export const RADIUS_BY_TIER = [150, 200, 250, 310, 370, 430] as const;

const GOLDEN_ANGLE = 2.399963229728653;
/** Clearance factor between coasts — includes headroom for one growth tier. */
const CLEARANCE = 1.18;
const CLEARANCE_PADDING = 55;
const SEARCH_STEP = 10;

export function islandRadiusForTier(sizeTier: number): number {
  const clampedTier = Math.min(Math.max(Math.trunc(sizeTier), 1), RADIUS_BY_TIER.length);
  return RADIUS_BY_TIER[clampedTier - 1] ?? RADIUS_BY_TIER[0];
}

/**
 * Pure function of island order and radii: appending an island leaves earlier
 * centers unchanged, but any earlier radius change shifts everything after it.
 * Position carries no stability promise (spec 030, reaffirmed by Leo 2026-09-01 — only
 * an island's shape stays put; see terrain.ts).
 */
export function packIslandCenters(radii: readonly number[]): WorldPoint[] {
  const centers: WorldPoint[] = [];
  radii.forEach((radius, index) => {
    if (index === 0) {
      centers.push({ x: 0, y: 0 });
      return;
    }
    const angle = index * GOLDEN_ANGLE;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let distance = 0;
    for (;;) {
      const candidate = { x: cos * distance, y: sin * distance };
      const clear = centers.every((center, otherIndex) => {
        const needed = (radius + (radii[otherIndex] ?? 0)) * CLEARANCE + CLEARANCE_PADDING;
        return Math.hypot(candidate.x - center.x, candidate.y - center.y) >= needed;
      });
      if (clear) {
        centers.push(candidate);
        return;
      }
      distance += SEARCH_STEP;
    }
  });
  return centers;
}
