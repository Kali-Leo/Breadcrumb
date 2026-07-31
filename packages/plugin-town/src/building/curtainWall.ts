/**
 * Purpose: curtain wall around a set of patches — circumference shape, gate placement
 * (splitting outer wards for roads when needed) and tower positions.
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/building/CurtainWall.hx.
 * Main exports: CurtainWall.
 */

import { Point } from "../geom/point";
import type { Polygon } from "../geom/polygon";
import { townRandom } from "../utils/townRandom";
import { countMatching, itemAt, replaceInArray } from "./arraySupport";
import { Model } from "./model";
import { Patch } from "./patch";

export class CurtainWall {
  shape: Polygon;
  segments: boolean[];
  gates: Point[] = [];
  towers: Point[] = [];

  private readonly real: boolean;
  private readonly patches: Patch[];

  constructor(real: boolean, model: Model, patches: Patch[], reserved: Point[]) {
    // Faithful port: the original assigns the literal `true` here (the parameter still
    // drives smoothing and gate building below).
    this.real = true;
    this.patches = patches;

    if (patches.length === 1) {
      this.shape = itemAt(patches, 0).shape;
    } else {
      this.shape = Model.findCircumference(patches);

      if (real) {
        const smoothFactor = Math.min(1, 40 / patches.length);
        // Compute all smoothed positions first, then copy coordinates into the existing
        // vertices (Polygon.set semantics — Point identity is preserved).
        const smoothed = [...this.shape].map((v) =>
          reserved.includes(v) ? v : this.shape.smoothVertex(v, smoothFactor),
        );
        for (let i = 0; i < smoothed.length; i++) {
          this.shape.at(i).set(itemAt(smoothed, i));
        }
      }
    }

    this.segments = [...this.shape].map(() => true);

    this.buildGates(real, model, reserved);
  }

  private buildGates(real: boolean, model: Model, reserved: Point[]): void {
    this.gates = [];

    // Entrances are vertices of the walls with more than 1 adjacent inner ward
    // so that a street could connect it to the city center
    const entrances: Point[] =
      this.patches.length > 1
        ? [...this.shape].filter(
            (v) =>
              !reserved.includes(v) && countMatching(this.patches, (p) => p.shape.contains(v)) > 1,
          )
        : [...this.shape].filter((v) => !reserved.includes(v));

    if (entrances.length === 0) {
      throw new Error("Bad walled area shape!");
    }

    do {
      const index = townRandom.int(0, entrances.length);
      const gate = itemAt(entrances, index);
      this.gates.push(gate);

      if (real) {
        const outerWards = model.patchByVertex(gate).filter((w) => !this.patches.includes(w));
        if (outerWards.length === 1) {
          // If there is no road leading from the walled patches,
          // we should make one by splitting an outer ward
          const outer = itemAt(outerWards, 0);
          if (outer.shape.length > 3) {
            const wall = this.shape.next(gate).subtract(this.shape.prev(gate));
            const out = new Point(wall.y, -wall.x);

            const farthest = outer.shape.max((v) => {
              if (this.shape.contains(v) || reserved.includes(v)) {
                return Number.NEGATIVE_INFINITY;
              }
              const dir = v.subtract(gate);
              return dir.dot(out) / dir.length;
            });

            const newPatches = outer.shape
              .split(gate, farthest)
              .map((half) => new Patch([...half]));
            replaceInArray(model.patches, outer, newPatches);
          }
        }
      }

      // Removing neighbouring entrances to ensure that no gates are too close
      if (index === 0) {
        entrances.splice(0, 2);
        entrances.pop();
      } else if (index === entrances.length - 1) {
        entrances.splice(index - 1, 2);
        entrances.shift();
      } else {
        entrances.splice(index - 1, 3);
      }
    } while (entrances.length >= 3);

    if (this.gates.length === 0) {
      throw new Error("Bad walled area shape!");
    }

    // Smooth further sections of the wall with gates
    if (real) {
      for (const gate of this.gates) {
        gate.set(this.shape.smoothVertex(gate));
      }
    }
  }

  buildTowers(): void {
    this.towers = [];
    if (this.real) {
      const len = this.shape.length;
      for (let i = 0; i < len; i++) {
        const t = this.shape.at(i);
        if (
          !this.gates.includes(t) &&
          ((this.segments[(i + len - 1) % len] ?? false) || (this.segments[i] ?? false))
        ) {
          this.towers.push(t);
        }
      }
    }
  }

  getRadius(): number {
    let radius = 0.0;
    for (const v of this.shape) {
      radius = Math.max(radius, v.length);
    }
    return radius;
  }

  bordersBy(p: Patch, v0: Point, v1: Point): boolean {
    const index = this.patches.includes(p)
      ? this.shape.findEdge(v0, v1)
      : this.shape.findEdge(v1, v0);
    return index !== -1 && (this.segments[index] ?? false);
  }

  borders(p: Patch): boolean {
    const withinWalls = this.patches.includes(p);
    const length = this.shape.length;

    for (let i = 0; i < length; i++) {
      if (this.segments[i] ?? false) {
        const v0 = this.shape.at(i);
        const v1 = this.shape.at((i + 1) % length);
        const index = withinWalls ? p.shape.findEdge(v0, v1) : p.shape.findEdge(v1, v0);
        if (index !== -1) {
          return true;
        }
      }
    }

    return false;
  }
}
