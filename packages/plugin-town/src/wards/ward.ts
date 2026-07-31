/**
 * Purpose: base city ward — city-block insetting and the outskirts building filter; subclasses
 * use shallow 1-level inheritance and the base deliberately has NO static rateLocation (Haxe
 * statics are not inherited, so only wards declaring their own rating expose one).
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/towngenerator/wards/Ward.hx.
 * Main exports: Ward, WardConstructor.
 */

import type { Model } from "../building/model";
import type { Patch } from "../building/patch";
import { distance2line } from "../geom/geomUtils";
import type { Point } from "../geom/point";
import type { Polygon } from "../geom/polygon";
import { townRandom } from "../utils/townRandom";
import {
  ALLEY,
  createAlleys,
  createOrthoBuilding,
  MAIN_STREET,
  REGULAR_STREET,
} from "./wardShapes";

/** Ward class shape used by Model.WARDS; rateLocation is optional (Reflect.field port). */
export interface WardConstructor {
  new (model: Model, patch: Patch): Ward;
  rateLocation?(model: Model, patch: Patch): number;
}

interface PopulatedEdge {
  x: number;
  y: number;
  dx: number;
  dy: number;
  d: number;
}

export class Ward {
  static readonly MAIN_STREET = MAIN_STREET;
  static readonly REGULAR_STREET = REGULAR_STREET;
  static readonly ALLEY = ALLEY;

  static createAlleys = createAlleys;
  static createOrthoBuilding = createOrthoBuilding;

  model: Model;
  patch: Patch;

  geometry: Polygon[] = [];

  constructor(model: Model, patch: Patch) {
    this.model = model;
    this.patch = patch;
  }

  createGeometry(): void {
    this.geometry = [];
  }

  getCityBlock(): Polygon {
    const insetDist: number[] = [];

    const innerPatch = this.model.wall === null || this.patch.withinWalls;
    this.patch.shape.forEdge((v0, v1) => {
      if (this.model.wall?.bordersBy(this.patch, v0, v1)) {
        // Not too close to the wall
        insetDist.push(MAIN_STREET / 2);
      } else {
        let onStreet =
          innerPatch && this.model.plaza !== null && this.model.plaza.shape.findEdge(v1, v0) !== -1;
        if (!onStreet) {
          for (const street of this.model.arteries) {
            if (street.contains(v0) && street.contains(v1)) {
              onStreet = true;
              break;
            }
          }
        }
        insetDist.push((onStreet ? MAIN_STREET : innerPatch ? REGULAR_STREET : ALLEY) / 2);
      }
    });

    return this.patch.shape.isConvex()
      ? this.patch.shape.shrink(insetDist)
      : this.patch.shape.buffer(insetDist);
  }

  protected filterOutskirts(): void {
    const populatedEdges: PopulatedEdge[] = [];

    const addEdge = (v1: Point, v2: Point, factor = 1.0): void => {
      const dx = v2.x - v1.x;
      const dy = v2.y - v1.y;
      const distances = new Map<Point, number>();
      const farthest = this.patch.shape.max((v) => {
        const measure =
          (v !== v1 && v !== v2 ? distance2line(v1.x, v1.y, dx, dy, v.x, v.y) : 0) * factor;
        distances.set(v, measure);
        return measure;
      });
      populatedEdges.push({ x: v1.x, y: v1.y, dx, dy, d: distances.get(farthest) ?? 0 });
    };

    this.patch.shape.forEdge((v1, v2) => {
      let onRoad = false;
      for (const street of this.model.arteries) {
        if (street.contains(v1) && street.contains(v2)) {
          onRoad = true;
          break;
        }
      }

      if (onRoad) {
        addEdge(v1, v2, 1);
      } else {
        const n = this.model.getNeighbour(this.patch, v1);
        if (n?.withinCity) {
          addEdge(v1, v2, this.model.isEnclosed(n) ? 1 : 0.4);
        }
      }
    });

    // For every vertex: 1 for gates, a random density for purely-urban vertices, otherwise 0
    const density: number[] = [];
    for (const v of this.patch.shape) {
      if (this.model.gates.includes(v)) {
        density.push(1);
      } else {
        density.push(
          this.model.patchByVertex(v).every((p) => p.withinCity) ? 2 * townRandom.float() : 0,
        );
      }
    }

    this.geometry = this.geometry.filter((building) => {
      let minDist = 1.0;
      for (const edge of populatedEdges) {
        for (const v of building) {
          // Distance from the center of the building to the edge
          const d = distance2line(edge.x, edge.y, edge.dx, edge.dy, v.x, v.y);
          const dist = d / edge.d;
          if (dist < minDist) {
            minDist = dist;
          }
        }
      }

      const c = building.center;
      const weights = this.patch.shape.interpolate(c);
      let p = 0.0;
      for (let j = 0; j < weights.length; j++) {
        p += (density[j] ?? 0) * (weights[j] ?? 0);
      }
      minDist /= p;

      return townRandom.fuzzy(1) > minDist;
    });
  }

  getLabel(): string | null {
    return null;
  }
}
