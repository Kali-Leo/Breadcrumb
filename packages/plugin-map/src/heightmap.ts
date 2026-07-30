/**
 * Purpose: Azgaar-style heightmap sculpting on the island mesh — blob-spread hills
 * and pits, ranged ridges, smoothing, radial mask, plus an fBm detail layer.
 * Heights live in 0..100. Ported from Azgaar's FMG heightmap generator (MIT).
 * Main exports: generateHeightmap.
 */
import { createNoise2D } from "simplex-noise";
import type { IslandMesh } from "./mesh";
import type { SeededRandom } from "./random";

interface SculptContext {
  mesh: IslandMesh;
  heights: Float64Array;
  random: SeededRandom;
  blobPower: number;
}

/** Azgaar calibrates blob decay to cell count so features scale with resolution. */
function blobPowerFor(cellCount: number): number {
  if (cellCount < 1200) return 0.93;
  if (cellCount < 2200) return 0.95;
  if (cellCount < 3500) return 0.96;
  return 0.97;
}

function pickCellNear(context: SculptContext, maxRadiusFraction: number): number {
  const { mesh, random } = context;
  const limit = mesh.bound * maxRadiusFraction;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const index = Math.floor(random() * mesh.points.length);
    const point = mesh.points[index];
    if (point !== undefined && Math.hypot(point.x, point.y) <= limit) return index;
  }
  return 0;
}

/** Queue-based blob spread: change decays by `change ** blobPower` with jitter. */
function raiseBlob(context: SculptContext, startCell: number, height: number, sign: 1 | -1): void {
  const { mesh, heights, random, blobPower } = context;
  const change = new Float64Array(mesh.points.length);
  const queue: number[] = [startCell];
  change[startCell] = height;
  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head];
    if (cell === undefined) continue;
    const current = change[cell] ?? 0;
    heights[cell] = Math.min(100, Math.max(0, (heights[cell] ?? 0) + sign * current));
    const spread = current ** blobPower * (random() * 0.2 + 0.9);
    if (spread <= 1) continue;
    for (const neighbor of mesh.neighbors[cell] ?? []) {
      if ((change[neighbor] ?? 0) !== 0) continue;
      change[neighbor] = spread;
      queue.push(neighbor);
    }
  }
}

/** Greedy path between two cells, then a decaying ridge wavefront along it. */
function raiseRange(context: SculptContext, from: number, to: number, height: number): void {
  const { mesh, heights, random } = context;
  const target = mesh.points[to];
  if (target === undefined) return;
  const path: number[] = [from];
  let current = from;
  for (let step = 0; step < mesh.points.length && current !== to; step += 1) {
    let bestNeighbor = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const neighbor of mesh.neighbors[current] ?? []) {
      const point = mesh.points[neighbor];
      if (point === undefined) continue;
      const distance = Math.hypot(point.x - target.x, point.y - target.y) * (random() * 0.3 + 0.85);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestNeighbor = neighbor;
      }
    }
    if (bestNeighbor < 0) break;
    current = bestNeighbor;
    path.push(current);
  }
  const linePower = 0.81;
  let wave = path;
  let change = height;
  const touched = new Set(path);
  while (change > 1.5 && wave.length > 0) {
    const nextWave: number[] = [];
    for (const cell of wave) {
      heights[cell] = Math.min(100, (heights[cell] ?? 0) + change * (random() * 0.3 + 0.85));
      for (const neighbor of context.mesh.neighbors[cell] ?? []) {
        if (touched.has(neighbor)) continue;
        touched.add(neighbor);
        nextWave.push(neighbor);
      }
    }
    wave = nextWave;
    change = change ** linePower - 1;
  }
}

function smooth(context: SculptContext, blend: number): void {
  const { mesh, heights } = context;
  const smoothed = new Float64Array(heights.length);
  for (let index = 0; index < heights.length; index += 1) {
    let sum = heights[index] ?? 0;
    let count = 1;
    for (const neighbor of mesh.neighbors[index] ?? []) {
      sum += heights[neighbor] ?? 0;
      count += 1;
    }
    smoothed[index] = ((heights[index] ?? 0) * (blend - 1) + sum / count) / blend;
  }
  heights.set(smoothed);
}

/** Radial falloff toward the bounds — guarantees ocean all around. */
function radialMask(context: SculptContext, radius: number): void {
  const { mesh, heights } = context;
  for (let index = 0; index < heights.length; index += 1) {
    const point = mesh.points[index];
    if (point === undefined) continue;
    const distance = Math.hypot(point.x, point.y) / radius;
    // Flat interior, steep shoulder — irregular silhouettes survive the mask.
    const falloff = Math.max(0, 1 - distance ** 3);
    heights[index] = (heights[index] ?? 0) * falloff;
  }
}

function addFbmDetail(context: SculptContext, radius: number, amplitude: number): void {
  const noise2D = createNoise2D(context.random);
  const { mesh, heights } = context;
  for (let index = 0; index < heights.length; index += 1) {
    const point = mesh.points[index];
    if (point === undefined) continue;
    let value = 0;
    let frequency = 1.6 / radius;
    let gain = 1;
    for (let octave = 0; octave < 3; octave += 1) {
      value += noise2D(point.x * frequency, point.y * frequency) * gain;
      frequency *= 2;
      gain *= 0.5;
    }
    heights[index] = Math.min(100, Math.max(0, (heights[index] ?? 0) + value * amplitude));
  }
}

/** Sculpts an island: one core massif, minor hills, ridges by tier, detail, mask. */
export function generateHeightmap(
  mesh: IslandMesh,
  random: SeededRandom,
  radius: number,
  sizeTier: number,
): Float64Array {
  const context: SculptContext = {
    mesh,
    heights: new Float64Array(mesh.points.length),
    random,
    blobPower: blobPowerFor(mesh.points.length),
  };
  raiseBlob(context, pickCellNear(context, 0.45), 52 + sizeTier * 3, 1);
  if (sizeTier >= 4) {
    raiseBlob(context, pickCellNear(context, 0.55), 40 + random() * 10, 1);
  }
  const minorHills = 2 + sizeTier;
  for (let hill = 0; hill < minorHills; hill += 1) {
    raiseBlob(context, pickCellNear(context, 0.85), 18 + random() * 18, 1);
  }
  for (let ridge = 0; ridge < Math.max(0, sizeTier - 2); ridge += 1) {
    raiseRange(
      context,
      pickCellNear(context, 0.55),
      pickCellNear(context, 0.75),
      24 + random() * 14,
    );
  }
  if (sizeTier >= 2 && random() < 0.6) {
    raiseBlob(context, pickCellNear(context, 0.45), 14 + random() * 10, -1);
  }
  addFbmDetail(context, radius, 11);
  radialMask(context, radius * 1.15);
  smooth(context, 3);
  return context.heights;
}
