/**
 * Purpose: archipelago layout — fixed-slot phyllotaxis so existing islands never move
 * when new knowledge arrives; island radius quantized by size tier.
 * Main exports: islandSlotCenter, islandRadiusForTier, RADIUS_BY_TIER, SLOT_SPACING.
 */
import type { WorldPoint } from "./types";

export const RADIUS_BY_TIER = [90, 130, 170, 210, 250, 290] as const;

/**
 * Distance constant of the Vogel spiral. Neighbour slots stay ≥ ~0.9×this apart,
 * which clears two max-tier islands (2 × 290) with margin to spare.
 */
export const SLOT_SPACING = 660;

const GOLDEN_ANGLE = 2.399963229728653;

export function islandRadiusForTier(sizeTier: number): number {
  const clampedTier = Math.min(Math.max(Math.trunc(sizeTier), 1), RADIUS_BY_TIER.length);
  return RADIUS_BY_TIER[clampedTier - 1] ?? RADIUS_BY_TIER[0];
}

/** Slot position depends only on the slot index — append-only, so it never shifts. */
export function islandSlotCenter(slotIndex: number): WorldPoint {
  if (slotIndex <= 0) return { x: 0, y: 0 };
  const radius = SLOT_SPACING * Math.sqrt(slotIndex);
  const angle = slotIndex * GOLDEN_ANGLE;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}
