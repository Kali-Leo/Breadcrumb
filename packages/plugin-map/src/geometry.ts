/**
 * Purpose: small geometry helpers for cartography — chaining loose edges into polylines
 * or loops, Chaikin corner-cutting, centroids and areas.
 * Main exports: chainEdges, chaikinSmooth, averagePoint, polygonArea, quantizedPointKey.
 */
import type { WorldPoint } from "./types";

export interface Edge {
  a: WorldPoint;
  b: WorldPoint;
}

export interface Chain {
  points: WorldPoint[];
  closed: boolean;
}

/** Stable key for float endpoints so shared corners compare equal. */
export function quantizedPointKey(point: WorldPoint): string {
  return `${Math.round(point.x * 100)}:${Math.round(point.y * 100)}`;
}

/** Orientation-independent key so the same cell wall counts once from either side. */
export function undirectedEdgeKey(a: WorldPoint, b: WorldPoint): string {
  const keyA = quantizedPointKey(a);
  const keyB = quantizedPointKey(b);
  return keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
}

/** Joins loose edges end-to-end into polylines; detects closed loops. */
export function chainEdges(edges: readonly Edge[]): Chain[] {
  const edgesAtPoint = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    for (const key of [quantizedPointKey(edge.a), quantizedPointKey(edge.b)]) {
      const bucket = edgesAtPoint.get(key) ?? [];
      bucket.push(index);
      edgesAtPoint.set(key, bucket);
    }
  });
  const used = new Array<boolean>(edges.length).fill(false);

  function takeUnusedEdgeAt(pointKey: string): Edge | null {
    for (const index of edgesAtPoint.get(pointKey) ?? []) {
      if (used[index] !== true) {
        used[index] = true;
        const edge = edges[index];
        return edge ?? null;
      }
    }
    return null;
  }

  const chains: Chain[] = [];
  for (let start = 0; start < edges.length; start += 1) {
    if (used[start] === true) continue;
    const startEdge = edges[start];
    if (startEdge === undefined) continue;
    used[start] = true;
    const points: WorldPoint[] = [startEdge.a, startEdge.b];

    let tip = startEdge.b;
    for (;;) {
      const next = takeUnusedEdgeAt(quantizedPointKey(tip));
      if (next === null) break;
      tip = quantizedPointKey(next.a) === quantizedPointKey(tip) ? next.b : next.a;
      points.push(tip);
    }
    let head = startEdge.a;
    for (;;) {
      const previous = takeUnusedEdgeAt(quantizedPointKey(head));
      if (previous === null) break;
      head = quantizedPointKey(previous.a) === quantizedPointKey(head) ? previous.b : previous.a;
      points.unshift(head);
    }

    const first = points.at(0);
    const last = points.at(-1);
    const closed =
      points.length > 2 &&
      first !== undefined &&
      last !== undefined &&
      quantizedPointKey(first) === quantizedPointKey(last);
    if (closed) points.pop();
    chains.push({ points, closed });
  }
  return chains;
}

/** Chaikin corner cutting; keeps endpoints of open polylines. */
export function chaikinSmooth(
  points: readonly WorldPoint[],
  iterations: number,
  closed: boolean,
): WorldPoint[] {
  let current: WorldPoint[] = [...points];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (current.length < 3) break;
    const next: WorldPoint[] = [];
    const first = current.at(0);
    if (!closed && first !== undefined) next.push(first);
    const segmentCount = closed ? current.length : current.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const a = current[index];
      const b = current[(index + 1) % current.length];
      if (a === undefined || b === undefined) continue;
      next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    const last = current.at(-1);
    if (!closed && last !== undefined) next.push(last);
    current = next;
  }
  return current;
}

export function averagePoint(points: readonly WorldPoint[]): WorldPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  let sumX = 0;
  let sumY = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
  }
  return { x: sumX / points.length, y: sumY / points.length };
}

/** Ray-casting point-in-polygon test (for telling lakes from sibling landmasses). */
export function pointInPolygon(point: WorldPoint, polygon: readonly WorldPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    if (a === undefined || b === undefined) continue;
    const crosses = a.y > point.y !== b.y > point.y;
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Unsigned shoelace area. */
export function polygonArea(points: readonly WorldPoint[]): number {
  let doubled = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    doubled += a.x * b.y - b.x * a.y;
  }
  return Math.abs(doubled) / 2;
}
