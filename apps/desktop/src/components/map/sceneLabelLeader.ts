/**
 * Purpose: the leader line that pins a stray island name back to its island (spec 031 §4) —
 * drawn only when a name could not stay on its own land, as a thin low-alpha ink hairline
 * from the nearest edge of the name's box to that island's coast.
 * Main exports: buildLabelLeader.
 */
import type { IslandModel, WorldPoint } from "@breadcrumb/feature-map";
import { Graphics } from "pixi.js";
import type { LabelBoxSize } from "./mapLabelPlacement";
import { mapTheme } from "./mapTheme";

/** Thin and faint: the line must say "this name belongs there" without being read as a road. */
const LEADER_WIDTH = 1;
const LEADER_ALPHA = 0.35;
/** The line stops just inside the coast rather than at the island's middle. */
const LEADER_COAST_FACTOR = 0.95;

/** The midpoint of whichever box edge faces the island — where the line leaves the name. */
function nearestEdgeMidpoint(
  labelCenter: WorldPoint,
  box: LabelBoxSize,
  target: WorldPoint,
): WorldPoint {
  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  const midpoints: WorldPoint[] = [
    { x: labelCenter.x, y: labelCenter.y - halfHeight },
    { x: labelCenter.x, y: labelCenter.y + halfHeight },
    { x: labelCenter.x - halfWidth, y: labelCenter.y },
    { x: labelCenter.x + halfWidth, y: labelCenter.y },
  ];
  return midpoints.reduce((nearest, candidate) =>
    Math.hypot(candidate.x - target.x, candidate.y - target.y) <
    Math.hypot(nearest.x - target.x, nearest.y - target.y)
      ? candidate
      : nearest,
  );
}

/** Returns null when the name sits on top of its own island's centre — there is nothing to
 * point at, and a zero-length leader would draw as a dot. */
export function buildLabelLeader(
  island: IslandModel,
  labelCenter: WorldPoint,
  box: LabelBoxSize,
): Graphics | null {
  const start = nearestEdgeMidpoint(labelCenter, box, island.center);
  const offsetX = start.x - island.center.x;
  const offsetY = start.y - island.center.y;
  const distance = Math.hypot(offsetX, offsetY);
  if (distance <= 0) return null;
  const reach = island.radius * LEADER_COAST_FACTOR;
  const end = {
    x: island.center.x + (offsetX / distance) * reach,
    y: island.center.y + (offsetY / distance) * reach,
  };
  const leader = new Graphics();
  leader.moveTo(start.x, start.y);
  leader.lineTo(end.x, end.y);
  leader.stroke({ width: LEADER_WIDTH, color: mapTheme.inkSoft, alpha: LEADER_ALPHA });
  return leader;
}
