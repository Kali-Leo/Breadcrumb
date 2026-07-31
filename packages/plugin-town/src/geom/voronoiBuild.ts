/**
 * Purpose: Voronoi construction pipeline — build a diagram from seed points (with an
 * auto-sized frame) and one Lloyd relaxation step moving seeds to region centers.
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/geom/Voronoi.hx.
 * Main exports: buildVoronoi, relaxVoronoi.
 */

import { contains, remove } from "../utils/arrayHelpers";
import type { Point } from "./point";
import { Voronoi } from "./voronoi";

/** Builds a diagram whose frame extends the seed bounds by a quarter of each dimension. */
export function buildVoronoi(vertices: Point[]): Voronoi {
  let minx = 1e10;
  let miny = 1e10;
  let maxx = -1e9;
  let maxy = -1e9;
  for (const v of vertices) {
    if (v.x < minx) {
      minx = v.x;
    }
    if (v.y < miny) {
      miny = v.y;
    }
    if (v.x > maxx) {
      maxx = v.x;
    }
    if (v.y > maxy) {
      maxy = v.y;
    }
  }
  const dx = (maxx - minx) * 0.5;
  const dy = (maxy - miny) * 0.5;

  const voronoi = new Voronoi(minx - dx / 2, miny - dy / 2, maxx + dx / 2, maxy + dy / 2);
  for (const v of vertices) {
    voronoi.addPoint(v);
  }

  return voronoi;
}

/** One Lloyd relaxation step: moves (selected) seeds to their region centers. */
export function relaxVoronoi(voronoi: Voronoi, toRelax: Point[] | null = null): Voronoi {
  const regions = voronoi.partioning();

  const points = voronoi.points.slice();
  for (const p of voronoi.frame) {
    remove(points, p);
  }

  const relaxSet = toRelax ?? voronoi.points;
  for (const r of regions) {
    if (contains(relaxSet, r.seed)) {
      remove(points, r.seed);
      points.push(r.center());
    }
  }

  return buildVoronoi(points);
}
