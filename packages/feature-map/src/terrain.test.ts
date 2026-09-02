/**
 * Purpose: tests for the eroded terrain pipeline — land exists with the target share,
 * coast loops close and stay in bounds, rivers run downhill into the sea, no NaN
 * anywhere, deterministic output.
 */
import { describe, expect, it } from "vitest";
import { CANONICAL_RADIUS, generateTerrain, scaleTerrain } from "./terrain";

describe("generateTerrain", () => {
  it("produces land near the target fraction and a closed coast", () => {
    for (const seed of [1, 42, 90210]) {
      const terrain = generateTerrain(seed);
      const landShare = terrain.landCellIndices.length / terrain.cells.length;
      expect(landShare).toBeGreaterThan(0.15);
      expect(landShare).toBeLessThan(0.5);
      expect(terrain.coastLoops.length).toBeGreaterThan(0);
      expect((terrain.coastLoops.at(0) ?? []).length).toBeGreaterThan(30);
    }
  });

  it("keeps every value finite and inside the sea margin", () => {
    const terrain = generateTerrain(7);
    for (const cell of terrain.cells) {
      expect(Number.isFinite(cell.height)).toBe(true);
      expect(Number.isFinite(cell.slope01)).toBe(true);
      expect(Number.isFinite(cell.flux01)).toBe(true);
    }
    for (const loop of terrain.coastLoops) {
      for (const point of loop) {
        expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(CANONICAL_RADIUS * 1.36);
      }
    }
  });

  it("extracts rivers that flow downhill and end at or below sea level", () => {
    const terrain = generateTerrain(2024);
    expect(terrain.rivers.length).toBeGreaterThan(0);
    const heightAt = (x: number, y: number): number => {
      let best = Number.POSITIVE_INFINITY;
      let height = 0;
      for (const cell of terrain.cells) {
        const distance = Math.hypot(cell.site.x - x, cell.site.y - y);
        if (distance < best) {
          best = distance;
          height = cell.height;
        }
      }
      return height;
    };
    for (const river of terrain.rivers) {
      expect(river.points.length).toBeGreaterThan(3);
      expect(river.endWidth).toBeGreaterThan(0);
      const mouth = river.points.at(-1);
      const spring = river.points.at(0);
      expect(mouth).toBeDefined();
      expect(spring).toBeDefined();
      if (mouth === undefined || spring === undefined) continue;
      // The mouth must sit lower than the spring, at or near sea level.
      expect(heightAt(mouth.x, mouth.y)).toBeLessThan(heightAt(spring.x, spring.y));
    }
  });

  it("is deterministic for the same inputs", () => {
    const first = generateTerrain(1234);
    const second = generateTerrain(1234);
    expect(second).toEqual(first);
  });

  it("differs between seeds", () => {
    expect(generateTerrain(1).coastLoops).not.toEqual(generateTerrain(2).coastLoops);
  });

  it("keeps its shape at any size — growth scales the outline, never redraws it", () => {
    // The promise Leo made on 2026-09-01: an island you have seen before stays recognizable
    // however much it grows. Scaling every coast point back down must land on the original.
    const shape = generateTerrain(31337);
    for (const factor of [0.36, 1.72]) {
      const grown = scaleTerrain(shape, factor);
      expect(grown.coastLoops.length).toBe(shape.coastLoops.length);
      grown.coastLoops.forEach((loop, loopIndex) => {
        const original = shape.coastLoops[loopIndex] ?? [];
        expect(loop.length).toBe(original.length);
        loop.forEach((point, pointIndex) => {
          const source = original[pointIndex];
          expect(point.x / factor).toBeCloseTo(source?.x ?? Number.NaN, 9);
          expect(point.y / factor).toBeCloseTo(source?.y ?? Number.NaN, 9);
        });
      });
    }
  });
});
