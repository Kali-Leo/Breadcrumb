/**
 * Purpose: tests for terrain generation — land exists, coast loops are closed and
 * finite, everything stays inside the sea margin, output is deterministic.
 */
import { describe, expect, it } from "vitest";
import { generateTerrain } from "./terrain";

describe("generateTerrain", () => {
  it("always produces land and at least one closed coast loop", () => {
    for (const seed of [1, 42, 90210, 0xdeadbeef]) {
      const terrain = generateTerrain(seed, 130);
      expect(terrain.landCellIndices.length).toBeGreaterThan(0);
      expect(terrain.coastLoops.length).toBeGreaterThan(0);
      const outerLoop = terrain.coastLoops.at(0) ?? [];
      expect(outerLoop.length).toBeGreaterThan(8);
    }
  });

  it("keeps every coast point finite and inside the sea margin", () => {
    const radius = 170;
    const terrain = generateTerrain(7, radius);
    for (const loop of terrain.coastLoops) {
      for (const point of loop) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
        expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(radius * 1.35);
      }
    }
  });

  it("is deterministic for the same seed and radius", () => {
    const first = generateTerrain(1234, 210);
    const second = generateTerrain(1234, 210);
    expect(second).toEqual(first);
  });

  it("differs between seeds", () => {
    const first = generateTerrain(1, 130);
    const second = generateTerrain(2, 130);
    expect(second.coastLoops).not.toEqual(first.coastLoops);
  });
});
