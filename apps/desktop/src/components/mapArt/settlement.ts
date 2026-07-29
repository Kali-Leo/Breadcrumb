/**
 * Purpose: composes a whole settlement on its island — buildings by tier plus
 * deterministic vegetation, all placed with the island's PRNG.
 * Main exports: drawSettlement.
 */
import type { MapPlace } from "@breadcrumb/plugin-map";
import { drawCastle, drawHut, drawPineTree, drawRoundTree } from "./buildings";
import { hashString, seededRandom } from "./prng";

export function drawSettlement(
  context: CanvasRenderingContext2D,
  place: MapPlace,
  x: number,
  y: number,
  scale: number,
): void {
  const jitter = seededRandom(hashString(place.id) + 99);
  const size = place.radius * scale;

  if (place.tier === "house") {
    drawHut(context, x, y + size * 0.35, size * 0.9, jitter);
    drawPineTree(context, x - size * 0.85, y + size * 0.4, size * 0.55, jitter);
  } else if (place.tier === "village") {
    drawHut(context, x - size * 0.5, y + size * 0.42, size * 0.62, jitter);
    drawHut(context, x + size * 0.42, y + size * 0.5, size * 0.74, jitter);
    drawHut(context, x + size * 0.05, y - size * 0.12, size * 0.5, jitter);
    drawRoundTree(context, x - size * 0.95, y + size * 0.1, size * 0.42, jitter);
    drawPineTree(context, x + size * 0.95, y + size * 0.05, size * 0.5, jitter);
  } else {
    drawCastle(context, x, y + size * 0.18, size * 0.72, jitter);
    drawHut(context, x - size * 0.78, y + size * 0.52, size * 0.34, jitter);
    drawHut(context, x + size * 0.78, y + size * 0.56, size * 0.36, jitter);
    drawHut(context, x - size * 0.3, y + size * 0.72, size * 0.3, jitter);
    drawPineTree(context, x - size * 1.08, y + size * 0.2, size * 0.34, jitter);
    drawRoundTree(context, x + size * 1.1, y + size * 0.26, size * 0.32, jitter);
  }
}
