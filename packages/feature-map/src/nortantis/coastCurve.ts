/**
 * Purpose: coastline smoothing — turns a closed coast polygon into a flowing curve
 * using centripetal Catmull-Rom splines, one spline segment per coast edge.
 * Ported from Nortantis (AGPL-3.0) src/nortantis/CurveCreator.java.
 * Main exports: smoothCoastLoop.
 */
import type { WorldPoint } from "../types";

/**
 * How many curve samples an average input segment receives. Nortantis uses a fixed
 * 4px spacing at map resolution; our loops live in world units of arbitrary scale, so
 * the spacing is derived from the loop's own average edge length instead.
 */
export const CURVE_SAMPLES_PER_SEGMENT = 3;

/** Port of CurveCreator.calcT with alpha = 0.5 (the centripetal parameterization). */
function calcT(t: number, p0: WorldPoint, p1: WorldPoint): number {
  const a = (p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2;
  const b = a ** 0.5;
  const alpha = 0.5;
  return b ** alpha + t;
}

/**
 * Port of CurveCreator.createCurve(p0, p1, p2, p3): samples the centripetal
 * Catmull-Rom segment from p1 (inclusive) toward p2 (exclusive), NaN points skipped.
 */
function createCurveSegment(
  p0: WorldPoint,
  p1: WorldPoint,
  p2: WorldPoint,
  p3: WorldPoint,
  distanceBetweenPoints: number,
): WorldPoint[] {
  const numPoints = Math.trunc(Math.hypot(p2.x - p1.x, p2.y - p1.y) / distanceBetweenPoints);
  if (numPoints === 0) return [p1, p2];

  const t0 = 0;
  const t1 = calcT(t0, p0, p1);
  const t2 = calcT(t1, p1, p2);
  const t3 = calcT(t2, p2, p3);

  const curve: WorldPoint[] = [];
  const lerp = (a: WorldPoint, b: WorldPoint, wa: number, wb: number): WorldPoint => ({
    x: a.x * wa + b.x * wb,
    y: a.y * wa + b.y * wb,
  });
  const step = (t2 - t1) / numPoints;
  for (let t = t1; t < t2; t += step) {
    const a1 = lerp(p0, p1, (t1 - t) / (t1 - t0), (t - t0) / (t1 - t0));
    const a2 = lerp(p1, p2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1));
    const a3 = lerp(p2, p3, (t3 - t) / (t3 - t2), (t - t2) / (t3 - t2));
    const b1 = lerp(a1, a2, (t2 - t) / (t2 - t0), (t - t0) / (t2 - t0));
    const b2 = lerp(a2, a3, (t3 - t) / (t3 - t1), (t - t1) / (t3 - t1));
    const c = lerp(b1, b2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1));
    if (!Number.isNaN(c.x) && !Number.isNaN(c.y)) curve.push(c);
  }
  return curve;
}

/**
 * Smooths a closed coast ring (no duplicated end point) into a flowing curve.
 * ADAPTATION: CurveCreator.createCurve(path) handles open paths and fabricates control
 * points at the ends; a coast is a closed loop, so control points wrap around instead
 * and every edge becomes one spline segment. Output stays a ring, ≤ 4x input length.
 */
export function smoothCoastLoop(loop: WorldPoint[]): WorldPoint[] {
  const count = loop.length;
  if (count < 3) return [...loop];

  let perimeter = 0;
  for (let index = 0; index < count; index += 1) {
    const a = loop[index];
    const b = loop[(index + 1) % count];
    if (a !== undefined && b !== undefined) perimeter += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const distanceBetweenPoints = Math.max(
    perimeter / (count * CURVE_SAMPLES_PER_SEGMENT),
    Number.EPSILON,
  );

  // Java seeds the output with path[0], then appends each segment minus its first
  // point; the last segment stops short of p2 = loop[0], so the ring never closes twice.
  const first = loop[0];
  if (first === undefined) return [...loop];
  const curve: WorldPoint[] = [first];
  for (let index = 0; index < count; index += 1) {
    const p0 = loop[(index - 1 + count) % count];
    const p1 = loop[index];
    const p2 = loop[(index + 1) % count];
    const p3 = loop[(index + 2) % count];
    if (p0 === undefined || p1 === undefined || p2 === undefined || p3 === undefined) continue;
    const segment = createCurveSegment(p0, p1, p2, p3, distanceBetweenPoints);
    for (let j = 1; j < segment.length; j += 1) {
      const point = segment[j];
      // The degenerate two-point segment ends exactly on p2; skip it when p2 is the
      // ring start so the loop stays free of a duplicated closing point.
      if (point === undefined || (index === count - 1 && point === loop[0])) continue;
      curve.push(point);
    }
  }
  return curve;
}
