/**
 * Purpose: town model — orchestrates patch generation, junction optimization, walls, streets
 * and ward assignment (build steps live in modelPatches/modelStreets/modelWards).
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/building/Model.hx.
 * Main exports: Model, Street. Side effect: sets Model.instance on successful build.
 */

import type { Point } from "../geom/point";
import { Polygon } from "../geom/polygon";
import { townRandom } from "../utils/townRandom";
import { AdministrationWard } from "../wards/administrationWard";
import { Cathedral } from "../wards/cathedral";
import { CraftsmenWard } from "../wards/craftsmenWard";
import { Market } from "../wards/market";
import { MerchantWard } from "../wards/merchantWard";
import { MilitaryWard } from "../wards/militaryWard";
import { Park } from "../wards/park";
import { PatriciateWard } from "../wards/patriciateWard";
import { Slum } from "../wards/slum";
import type { WardConstructor } from "../wards/ward";
import { itemAt } from "./arraySupport";
import type { CurtainWall } from "./curtainWall";
import { buildModelPatches, buildModelWalls, optimizeJunctions } from "./modelPatches";
import { buildModelStreets } from "./modelStreets";
import { createModelWards } from "./modelWards";
import type { Patch } from "./patch";
import type { Topology } from "./topology";

export type Street = Polygon;

const MAX_BUILD_ATTEMPTS = 60;

export class Model {
  static instance: Model | null = null;

  // biome-ignore format: keep the original 6-row layout of the ward list
  static readonly WARDS: WardConstructor[] = [
    CraftsmenWard, CraftsmenWard, MerchantWard, CraftsmenWard, CraftsmenWard, Cathedral,
    CraftsmenWard, CraftsmenWard, CraftsmenWard, CraftsmenWard, CraftsmenWard,
    CraftsmenWard, CraftsmenWard, CraftsmenWard, AdministrationWard, CraftsmenWard,
    Slum, CraftsmenWard, Slum, PatriciateWard, Market,
    Slum, CraftsmenWard, CraftsmenWard, CraftsmenWard, Slum,
    CraftsmenWard, CraftsmenWard, CraftsmenWard, MilitaryWard, Slum,
    CraftsmenWard, Park, PatriciateWard, Market, MerchantWard];

  /** Small Town 6, Large Town 10, Small City 15, Large City 24, Metropolis 40. */
  private readonly patchCount: number;

  private readonly plazaNeeded: boolean;
  private readonly citadelNeeded: boolean;
  private readonly wallsNeeded: boolean;

  topology!: Topology;

  patches!: Patch[];
  waterbody: Patch[] | null = null;
  /**
   * For a walled city it's a list of patches within the walls,
   * for a city without walls it's just a list of all city wards.
   */
  inner!: Patch[];
  citadel: Patch | null = null;
  plaza: Patch | null = null;
  center!: Point;

  border!: CurtainWall;
  wall: CurtainWall | null = null;

  cityRadius = 0;

  /** List of all entrances of a city including castle gates. */
  gates!: Point[];

  /** Joined list of streets (inside walls) and roads (outside walls) without duplicates. */
  arteries!: Street[];
  streets!: Street[];
  roads!: Street[];

  constructor(nPatches = -1, seed = -1) {
    if (seed > 0) {
      townRandom.reset(seed);
    }
    this.patchCount = nPatches !== -1 ? nPatches : 15;

    this.plazaNeeded = townRandom.bool();
    this.citadelNeeded = townRandom.bool();
    this.wallsNeeded = townRandom.bool();

    // Original retries forever on failure, consuming further RNG state each attempt;
    // ported with a bound so a pathological seed cannot hang the host.
    let attempts = 0;
    let built = false;
    while (!built) {
      try {
        this.build();
        Model.instance = this;
        built = true;
      } catch (error) {
        Model.instance = null;
        attempts++;
        if (attempts >= MAX_BUILD_ATTEMPTS) {
          throw error;
        }
      }
    }
  }

  private build(): void {
    this.streets = [];
    this.roads = [];

    buildModelPatches(
      this,
      this.patchCount,
      this.plazaNeeded,
      this.citadelNeeded,
      this.wallsNeeded,
    );
    optimizeJunctions(this);
    buildModelWalls(this, this.wallsNeeded);
    buildModelStreets(this);
    createModelWards(this, this.patchCount);
    this.buildGeometry();
  }

  static findCircumference(wards: Patch[]): Polygon {
    if (wards.length === 0) {
      return new Polygon();
    }
    if (wards.length === 1) {
      return new Polygon([...itemAt(wards, 0).shape]);
    }

    const edgeStarts: Point[] = [];
    const edgeEnds: Point[] = [];

    for (const w1 of wards) {
      w1.shape.forEdge((a, b) => {
        let outerEdge = true;
        for (const w2 of wards) {
          if (w2.shape.findEdge(b, a) !== -1) {
            outerEdge = false;
            break;
          }
        }
        if (outerEdge) {
          edgeStarts.push(a);
          edgeEnds.push(b);
        }
      });
    }

    const result = new Polygon();
    let index = 0;
    do {
      result.push(itemAt(edgeStarts, index));
      index = edgeStarts.indexOf(itemAt(edgeEnds, index));
    } while (index !== 0);

    return result;
  }

  patchByVertex(v: Point): Patch[] {
    return this.patches.filter((patch) => patch.shape.contains(v));
  }

  private buildGeometry(): void {
    for (const patch of this.patches) {
      patch.ward?.createGeometry();
    }
  }

  getNeighbour(patch: Patch, v: Point): Patch | null {
    const next = patch.shape.next(v);
    for (const p of this.patches) {
      if (p.shape.findEdge(next, v) !== -1) {
        return p;
      }
    }
    return null;
  }

  getNeighbours(patch: Patch): Patch[] {
    return this.patches.filter((p) => p !== patch && p.shape.borders(patch.shape));
  }

  /** A ward is "enclosed" if it belongs to the city and is surrounded by city wards. */
  isEnclosed(patch: Patch): boolean {
    return (
      patch.withinCity &&
      (patch.withinWalls || this.getNeighbours(patch).every((p) => p.withinCity))
    );
  }
}
