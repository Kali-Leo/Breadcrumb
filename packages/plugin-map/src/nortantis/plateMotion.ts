/**
 * Purpose: plate drift math — polar velocities, angle differences and the convergence
 * level between two moving plates.
 * Ported from Nortantis (AGPL-3.0) src/nortantis/WorldGraph.java and PolarCoordinate.java.
 * Main exports: calcLevelOfConvergence, PlateVelocity.
 */
import type { WorldPoint } from "../types";

/** PolarCoordinate port: angle in radians, radius is the drift speed (max 1). */
export interface PlateVelocity {
  angle: number;
  radius: number;
}

/**
 * Port of WorldGraph.calcAngleDifference: minimum distance in radians between two
 * angles, result in [0, pi]. Inputs are normalized into [0, 2*pi) first.
 */
function calcAngleDifference(angleA: number, angleB: number): number {
  let a1 = angleA;
  let a2 = angleB;
  while (a1 < 0) a1 += 2 * Math.PI;
  while (a2 < 0) a2 += 2 * Math.PI;
  if (a1 - a2 > Math.PI) a1 -= 2 * Math.PI;
  else if (a2 - a1 > Math.PI) a2 -= 2 * Math.PI;
  return Math.abs(a1 - a2);
}

/** Port of WorldGraph.calcUnilateralLevelOfConvergence: how much p1 moves toward p2. */
function calcUnilateralLevelOfConvergence(
  p1: WorldPoint,
  p1Velocity: PlateVelocity,
  p2: WorldPoint,
): number {
  const diffAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const theta = calcAngleDifference(p1Velocity.angle, diffAngle);
  return p1Velocity.radius * Math.cos(theta);
}

/**
 * Port of WorldGraph.calcLevelOfConvergence: symmetric convergence between two points
 * on different plates, each weighted by half. Result is in [-1, 1].
 */
export function calcLevelOfConvergence(
  p1: WorldPoint,
  p1Velocity: PlateVelocity,
  p2: WorldPoint,
  p2Velocity: PlateVelocity,
): number {
  return (
    0.5 * calcUnilateralLevelOfConvergence(p1, p1Velocity, p2) +
    0.5 * calcUnilateralLevelOfConvergence(p2, p2Velocity, p1)
  );
}
