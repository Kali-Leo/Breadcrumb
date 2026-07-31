/**
 * Purpose: tests for the tectonic-plate land mask — determinism, guaranteed sea ring
 * on boundary cells, land-capable interior and seed-to-seed variation.
 */
import { describe, expect, it } from "vitest";
import { buildIslandMesh, type IslandMesh } from "../mesh";
import { createSeededRandom } from "../random";
import { plateLandMask } from "./plates";

function meshForSeed(seed: number): IslandMesh {
  return buildIslandMesh(createSeededRandom(seed), 170, 2000);
}

describe("plateLandMask", () => {
  it("is deterministic for the same rng seed sequence", () => {
    const meshA = meshForSeed(11);
    const meshB = meshForSeed(11);
    const maskA = plateLandMask(meshA, createSeededRandom(77), 3);
    const maskB = plateLandMask(meshB, createSeededRandom(77), 3);
    expect([...maskB]).toEqual([...maskA]);
  });

  it("keeps every boundary cell at exactly zero", () => {
    for (const seed of [1, 42, 90210]) {
      const mesh = meshForSeed(seed);
      const mask = plateLandMask(mesh, createSeededRandom(seed), 4);
      for (let cell = 0; cell < mesh.points.length; cell += 1) {
        if (mesh.boundaryCells[cell] === true) expect(mask[cell]).toBe(0);
      }
    }
  });

  it("produces a land-capable interior with values in 0..1", () => {
    for (const seed of [5, 1234]) {
      const mesh = meshForSeed(seed);
      const mask = plateLandMask(mesh, createSeededRandom(seed), 3);
      let landCapable = 0;
      for (const value of mask) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
        if (value > 0.5) landCapable += 1;
      }
      expect(landCapable).toBeGreaterThan(mesh.points.length * 0.05);
    }
  });

  it("varies between rng seeds", () => {
    const mesh = meshForSeed(21);
    const maskA = plateLandMask(mesh, createSeededRandom(1), 3);
    const maskB = plateLandMask(mesh, createSeededRandom(2), 3);
    expect([...maskA]).not.toEqual([...maskB]);
  });
});
