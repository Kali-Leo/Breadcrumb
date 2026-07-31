/**
 * Purpose: patch generation, junction optimization and wall construction for the town model
 * (Model.buildPatches/optimizeJunctions/buildWalls as free functions over the Model surface).
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/building/Model.hx.
 * Main exports: buildModelPatches, optimizeJunctions, buildModelWalls.
 */

import { Point } from "../geom/point";
import type { Polygon } from "../geom/polygon";
import { Voronoi } from "../geom/voronoi";
import { sign } from "../utils/mathUtils";
import { townRandom } from "../utils/townRandom";
import { Castle } from "../wards/castle";
import { itemAt } from "./arraySupport";
import { CurtainWall } from "./curtainWall";
import type { Model } from "./model";
import { Patch } from "./patch";

/** Model.buildPatches: spiral point cloud, Voronoi partition, central relaxation. */
export function buildModelPatches(
  model: Model,
  patchCount: number,
  plazaNeeded: boolean,
  citadelNeeded: boolean,
  wallsNeeded: boolean,
): void {
  const startAngle = townRandom.float() * 2 * Math.PI;
  const points: Point[] = [];
  for (let i = 0; i < patchCount * 8; i++) {
    const a = startAngle + Math.sqrt(i) * 5;
    const r = i === 0 ? 0 : 10 + i * (2 + townRandom.float());
    points.push(new Point(Math.cos(a) * r, Math.sin(a) * r));
  }
  let voronoi = Voronoi.build(points);

  // Relaxing central wards
  for (let i = 0; i < 3; i++) {
    const toRelax: Point[] = [];
    for (let j = 0; j < 3; j++) {
      toRelax.push(itemAt(voronoi.points, j));
    }
    toRelax.push(itemAt(voronoi.points, patchCount));
    voronoi = Voronoi.relax(voronoi, toRelax);
  }

  voronoi.points.sort((p1, p2) => sign(p1.length - p2.length));
  const regions = voronoi.partioning();

  model.patches = [];
  model.inner = [];

  let count = 0;
  for (const region of regions) {
    const patch = Patch.fromRegion(region);
    model.patches.push(patch);

    if (count === 0) {
      model.center = patch.shape.min((p) => p.length);
      if (plazaNeeded) {
        model.plaza = patch;
      }
    } else if (count === patchCount && citadelNeeded) {
      model.citadel = patch;
      patch.withinCity = true;
    }

    if (count < patchCount) {
      patch.withinCity = true;
      patch.withinWalls = wallsNeeded;
      model.inner.push(patch);
    }

    count++;
  }
}

/** Array.indexOf with a fromIndex over polygon vertices (identity comparison). */
function polygonIndexOfFrom(poly: Polygon, v: Point, fromIndex: number): number {
  for (let i = fromIndex; i < poly.length; i++) {
    if (poly.at(i) === v) {
      return i;
    }
  }
  return -1;
}

/** Model.optimizeJunctions: merges vertices closer than 8 units by replacing references. */
export function optimizeJunctions(model: Model): void {
  const patchesToOptimize: Patch[] =
    model.citadel === null ? model.inner : model.inner.concat([model.citadel]);

  const wardsToClean: Patch[] = [];
  for (const w of patchesToOptimize) {
    let index = 0;
    while (index < w.shape.length) {
      const v0 = w.shape.at(index);
      const v1 = w.shape.at((index + 1) % w.shape.length);

      if (v0 !== v1 && Point.distance(v0, v1) < 8) {
        for (const w1 of model.patchByVertex(v1)) {
          if (w1 !== w) {
            w1.shape.set(w1.shape.indexOf(v1), v0);
            wardsToClean.push(w1);
          }
        }

        v0.addEq(v1);
        v0.scaleEq(0.5);

        w.shape.remove(v1);
      }
      index++;
    }
  }

  // Removing duplicate vertices
  for (const w of wardsToClean) {
    for (let i = 0; i < w.shape.length; i++) {
      const v = w.shape.at(i);
      let duplicateIndex = polygonIndexOfFrom(w.shape, v, i + 1);
      while (duplicateIndex !== -1) {
        w.shape.splice(duplicateIndex, 1);
        duplicateIndex = polygonIndexOfFrom(w.shape, v, i + 1);
      }
    }
  }
}

/** Model.buildWalls: city border/wall, patch pruning by radius, castle and its gates. */
export function buildModelWalls(model: Model, wallsNeeded: boolean): void {
  const reserved: Point[] = model.citadel !== null ? [...model.citadel.shape] : [];

  model.border = new CurtainWall(wallsNeeded, model, model.inner, reserved);
  if (wallsNeeded) {
    model.wall = model.border;
    model.wall.buildTowers();
  }

  const radius = model.border.getRadius();
  model.patches = model.patches.filter((p) => p.shape.distance(model.center) < radius * 3);

  model.gates = model.border.gates;

  if (model.citadel !== null) {
    const castle = new Castle(model, model.citadel);
    castle.wall.buildTowers();
    model.citadel.ward = castle;

    if (model.citadel.shape.compactness < 0.75) {
      throw new Error("Bad citadel shape!");
    }

    model.gates = model.gates.concat(castle.wall.gates);
  }
}
