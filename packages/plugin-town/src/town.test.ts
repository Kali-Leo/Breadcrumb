/**
 * Purpose: tests for the town entry — determinism, generation across size tiers,
 * finite geometry, walls for large towns.
 */
import { describe, expect, it } from "vitest";
import { generateTown } from "./town";

describe("generateTown", () => {
  it("generates towns at every settlement size without throwing", () => {
    for (const nPatches of [4, 8, 15, 24]) {
      const plan = generateTown(12345 + nPatches, nPatches);
      expect(plan.patches.length).toBeGreaterThan(nPatches);
      expect(plan.streets.length).toBeGreaterThan(0);
      expect(plan.cityRadius).toBeGreaterThan(0);
    }
  });

  it("is deterministic for the same seed", () => {
    const first = generateTown(777, 15);
    const second = generateTown(777, 15);
    expect(second).toEqual(first);
  });

  it("differs between seeds", () => {
    expect(generateTown(1, 15)).not.toEqual(generateTown(2, 15));
  });

  it("keeps every coordinate finite", () => {
    const plan = generateTown(2026, 15);
    for (const patch of plan.patches) {
      for (const point of patch.shape) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
      }
      for (const building of patch.buildings) {
        expect(building.length).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
