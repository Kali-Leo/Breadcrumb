/**
 * Purpose: hydraulic erosion on the island mesh — Planchon–Darboux sink filling,
 * downhill flow, flux accumulation, erosion, sea level by land-fraction quantile and
 * coast cleanup. Ported from mewo2/terrain (MIT); heights normalized to ~0..1.
 * Main exports: erodeTerrain, ErosionResult.
 */
import type { IslandMesh } from "./mesh";

export interface ErosionResult {
  /** Final heights, sea level shifted to 0 (land is > 0). */
  heights: Float64Array;
  /** Lowest-neighbor index per cell on the sink-filled surface (-1 = local outlet). */
  downhill: Int32Array;
  /** Accumulated flow per cell, normalized by the maximum. */
  flux01: Float64Array;
  /** Downhill slope magnitude per cell (normalized units). */
  slope: Float64Array;
}

const EPSILON = 1e-5;

function fillSinks(mesh: IslandMesh, heights: Float64Array): Float64Array {
  const filled = new Float64Array(heights.length).fill(Number.POSITIVE_INFINITY);
  for (let index = 0; index < heights.length; index += 1) {
    if (mesh.boundaryCells[index] === true) filled[index] = heights[index] ?? 0;
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < heights.length; index += 1) {
      if (mesh.boundaryCells[index] === true) continue;
      const original = heights[index] ?? 0;
      if (filled[index] === original) continue;
      for (const neighbor of mesh.neighbors[index] ?? []) {
        const throughNeighbor = (filled[neighbor] ?? 0) + EPSILON;
        if (original >= throughNeighbor) {
          filled[index] = original;
          changed = true;
          break;
        }
        if ((filled[index] ?? 0) > throughNeighbor && throughNeighbor > original) {
          filled[index] = throughNeighbor;
          changed = true;
        }
      }
    }
  }
  return filled;
}

function computeDownhill(mesh: IslandMesh, heights: Float64Array): Int32Array {
  const downhill = new Int32Array(heights.length).fill(-1);
  for (let index = 0; index < heights.length; index += 1) {
    let lowest = heights[index] ?? 0;
    for (const neighbor of mesh.neighbors[index] ?? []) {
      const height = heights[neighbor] ?? 0;
      if (height < lowest) {
        lowest = height;
        downhill[index] = neighbor;
      }
    }
  }
  return downhill;
}

function computeFlux(heights: Float64Array, downhill: Int32Array): Float64Array {
  const flux = new Float64Array(heights.length).fill(1 / heights.length);
  const order = [...flux.keys()].sort((a, b) => (heights[b] ?? 0) - (heights[a] ?? 0));
  for (const index of order) {
    const target = downhill[index] ?? -1;
    if (target >= 0) flux[target] = (flux[target] ?? 0) + (flux[index] ?? 0);
  }
  return flux;
}

function computeSlope(mesh: IslandMesh, heights: Float64Array, downhill: Int32Array): Float64Array {
  const slope = new Float64Array(heights.length);
  for (let index = 0; index < heights.length; index += 1) {
    const target = downhill[index] ?? -1;
    const from = mesh.points[index];
    const to = target >= 0 ? mesh.points[target] : undefined;
    if (from === undefined || to === undefined) continue;
    const run = Math.hypot(from.x - to.x, from.y - to.y) / mesh.bound;
    if (run > 0) slope[index] = ((heights[index] ?? 0) - (heights[target] ?? 0)) / run;
  }
  return slope;
}

/** mewo2 erosion rate: sqrt(flux)·slope dominated, small slope² thermal term. */
function erodeOnce(mesh: IslandMesh, heights: Float64Array, amount: number): void {
  const filled = fillSinks(mesh, heights);
  const downhill = computeDownhill(mesh, filled);
  const flux = computeFlux(filled, downhill);
  const slope = computeSlope(mesh, filled, downhill);
  const rate = new Float64Array(heights.length);
  let maxRate = 0;
  for (let index = 0; index < heights.length; index += 1) {
    const river = Math.sqrt(flux[index] ?? 0) * (slope[index] ?? 0);
    const creep = (slope[index] ?? 0) ** 2;
    rate[index] = Math.min(1000 * river + creep, 200);
    maxRate = Math.max(maxRate, rate[index] ?? 0);
  }
  if (maxRate <= 0) return;
  for (let index = 0; index < heights.length; index += 1) {
    heights[index] = (heights[index] ?? 0) - amount * ((rate[index] ?? 0) / maxRate);
  }
}

function setSeaLevel(heights: Float64Array, landFraction: number): void {
  const sorted = [...heights].sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * (1 - landFraction))] ?? 0;
  for (let index = 0; index < heights.length; index += 1) {
    heights[index] = (heights[index] ?? 0) - threshold;
  }
}

/** Sink lonely land, raise lonely water — de-noises the coast (mewo2 cleanCoast). */
function cleanCoast(mesh: IslandMesh, heights: Float64Array, iterations: number): void {
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let index = 0; index < heights.length; index += 1) {
      const neighborList = mesh.neighbors[index] ?? [];
      const landNeighbors = neighborList.filter((n) => (heights[n] ?? 0) > 0);
      if ((heights[index] ?? 0) > 0 && landNeighbors.length <= 1) {
        const seaNeighbors = neighborList.filter((n) => (heights[n] ?? 0) <= 0);
        if (seaNeighbors.length > 0) {
          heights[index] =
            seaNeighbors.reduce((sum, n) => sum + (heights[n] ?? 0), 0) / seaNeighbors.length;
        }
      } else if ((heights[index] ?? 0) <= 0 && landNeighbors.length >= neighborList.length - 1) {
        if (landNeighbors.length > 0) {
          heights[index] =
            landNeighbors.reduce((sum, n) => sum + (heights[n] ?? 0), 0) / landNeighbors.length;
        }
      }
    }
  }
}

export function erodeTerrain(
  mesh: IslandMesh,
  rawHeights: Float64Array,
  landFraction: number,
): ErosionResult {
  const heights = new Float64Array(rawHeights.length);
  for (let index = 0; index < rawHeights.length; index += 1) {
    heights[index] = (rawHeights[index] ?? 0) / 100;
  }
  erodeOnce(mesh, heights, 0.08);
  erodeOnce(mesh, heights, 0.04);
  setSeaLevel(heights, landFraction);
  cleanCoast(mesh, heights, 3);

  const filled = fillSinks(mesh, heights);
  const downhill = computeDownhill(mesh, filled);
  const flux = computeFlux(filled, downhill);
  const slope = computeSlope(mesh, filled, downhill);
  let maxFlux = 0;
  for (const value of flux) maxFlux = Math.max(maxFlux, value);
  const flux01 = new Float64Array(flux.length);
  for (let index = 0; index < flux.length; index += 1) {
    flux01[index] = maxFlux > 0 ? (flux[index] ?? 0) / maxFlux : 0;
  }
  return { heights, downhill, flux01, slope };
}
