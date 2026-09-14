/**
 * Purpose: the little geometry text detection needs and OpenCV would otherwise be imported
 * for — a convex hull, the smallest rectangle around it, the four corners in reading order,
 * and the mean of a probability map inside a quadrilateral.
 *
 * All of it exists so the browser edition does not ship the 10 MB of OpenCV.js the official
 * PaddleOCR SDK bundles for these four operations. Each function mirrors the OpenCV call
 * PaddleOCR's post-processing makes, and the differences are at the level of a pixel: the
 * rectangle is fitted to the hull of the region's boundary pixels, which is what
 * `minAreaRect` does with a contour; the corners are ordered the way `get_mini_boxes` orders
 * them; the score is the mean under a filled polygon, as `box_score_fast` computes it.
 * Main exports: Point, Quad, convexHull, minAreaRect, orderQuad, expandQuad, quadSide,
 * meanInsideQuad.
 */

export type Point = readonly [number, number];
/** Top-left, top-right, bottom-right, bottom-left. */
export type Quad = readonly [Point, Point, Point, Point];

const cross = (o: Point, a: Point, b: Point): number =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Andrew's monotone chain, counter-clockwise, collinear points dropped. */
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const half = (input: readonly Point[]): Point[] => {
    const chain: Point[] = [];
    for (const point of input) {
      while (chain.length >= 2) {
        const [a, b] = [chain[chain.length - 2], chain[chain.length - 1]] as [Point, Point];
        if (cross(a, b, point) > 0) break;
        chain.pop();
      }
      chain.push(point);
    }
    chain.pop();
    return chain;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** The corners in the order PaddleOCR's `get_mini_boxes` puts them: the two leftmost points
 * are left column, top first; the two rightmost are the right column, top first. */
export function orderQuad(corners: readonly Point[]): Quad {
  const byX = [...corners].sort((a, b) => a[0] - b[0]);
  const [l1, l2, r1, r2] = byX as [Point, Point, Point, Point];
  const [topLeft, bottomLeft] = l1[1] <= l2[1] ? [l1, l2] : [l2, l1];
  const [topRight, bottomRight] = r1[1] <= r2[1] ? [r1, r2] : [r2, r1];
  return [topLeft, topRight, bottomRight, bottomLeft];
}

/**
 * The smallest-area rectangle enclosing the points — rotating calipers over the hull: the
 * best rectangle has a side flush with a hull edge, so every edge's orientation is tried.
 * A single point or a collinear pair gives a rectangle with no width, which the caller then
 * rejects as too small, the same as OpenCV's answer.
 */
export function minAreaRect(points: readonly Point[]): Quad {
  const hull = convexHull(points);
  const first = hull[0];
  if (first === undefined)
    return [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ];
  let best: { area: number; corners: Point[] } | null = null;
  for (let index = 0; index < hull.length; index += 1) {
    const a = hull[index] as Point;
    const b = hull[(index + 1) % hull.length] as Point;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length === 0) continue;
    const u: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const v: Point = [-u[1], u[0]];
    let [minU, maxU, minV, maxV] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const p of hull) {
      const pu = p[0] * u[0] + p[1] * u[1];
      const pv = p[0] * v[0] + p[1] * v[1];
      minU = Math.min(minU, pu);
      maxU = Math.max(maxU, pu);
      minV = Math.min(minV, pv);
      maxV = Math.max(maxV, pv);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (best !== null && area >= best.area) continue;
    const corner = (cu: number, cv: number): Point => [
      cu * u[0] + cv * v[0],
      cu * u[1] + cv * v[1],
    ];
    best = {
      area,
      corners: [corner(minU, minV), corner(maxU, minV), corner(maxU, maxV), corner(minU, maxV)],
    };
  }
  // A single point has no edge to align with: a rectangle of no size, which is rejected.
  return orderQuad(best?.corners ?? [first, first, first, first]);
}

/** The shorter side, which is what decides whether a box is a line of text or a speck. */
export function quadSide(quad: Quad): number {
  const [tl, tr, br] = quad;
  return Math.min(
    Math.hypot(tr[0] - tl[0], tr[1] - tl[1]),
    Math.hypot(br[0] - tr[0], br[1] - tr[1]),
  );
}

export function polygonArea(polygon: readonly Point[]): number {
  let twice = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index] as Point;
    const b = polygon[(index + 1) % polygon.length] as Point;
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twice) / 2;
}

export function polygonPerimeter(polygon: readonly Point[]): number {
  let total = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index] as Point;
    const b = polygon[(index + 1) % polygon.length] as Point;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

/**
 * PaddleOCR's `unclip` for a rectangle: the detector is trained to find a shrunken core of
 * each line, and the box is grown back by `area × ratio ÷ perimeter` on every side. The
 * offset polygon of a rectangle is that rectangle with rounded corners, and the smallest
 * rectangle around it is the rectangle grown by the same distance — so the Clipper offset
 * and the second `minAreaRect` PaddleOCR runs collapse to moving each corner outward.
 */
export function expandQuad(quad: Quad, ratio: number): Quad {
  const perimeter = polygonPerimeter(quad);
  if (perimeter === 0) return quad;
  const distance = (polygonArea(quad) * ratio) / perimeter;
  const [tl, tr, br, bl] = quad;
  const width = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]) || 1;
  const height = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]) || 1;
  const across: Point = [
    ((tr[0] - tl[0]) / width) * distance,
    ((tr[1] - tl[1]) / width) * distance,
  ];
  const down: Point = [
    ((bl[0] - tl[0]) / height) * distance,
    ((bl[1] - tl[1]) / height) * distance,
  ];
  return [
    [tl[0] - across[0] - down[0], tl[1] - across[1] - down[1]],
    [tr[0] + across[0] - down[0], tr[1] + across[1] - down[1]],
    [br[0] + across[0] + down[0], br[1] + across[1] + down[1]],
    [bl[0] - across[0] + down[0], bl[1] - across[1] + down[1]],
  ];
}

function insideQuad(x: number, y: number, quad: Quad): boolean {
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i, i += 1) {
    const [xi, yi] = quad[i] as Point;
    const [xj, yj] = quad[j] as Point;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** `box_score_fast`: the mean of the map over the pixels the quadrilateral covers, or 0 when
 * it covers none. The map is row-major `width × height`. */
export function meanInsideQuad(map: Float32Array, width: number, height: number, quad: Quad) {
  const xs = quad.map((p) => p[0]);
  const ys = quad.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(height - 1, Math.ceil(Math.max(...ys)));
  let sum = 0;
  let count = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      // Pixel coordinates are pixel centres here, as they are in the contour the box was
      // fitted to, so the box's own boundary pixels count as covered.
      if (!insideQuad(x, y, quad)) continue;
      sum += map[y * width + x] as number;
      count += 1;
    }
  }
  return count === 0 ? 0 : sum / count;
}
