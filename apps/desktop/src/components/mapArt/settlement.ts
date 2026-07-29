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
    drawCastle(context, x, y + size * 0.3, size * 0.85, jitter);
    drawHut(context, x - size * 0.95, y + size * 0.62, size * 0.42, jitter);
    drawHut(context, x + size * 0.95, y + size * 0.66, size * 0.46, jitter);
    drawPineTree(context, x - size * 1.25, y + size * 0.25, size * 0.4, jitter);
    drawRoundTree(context, x + size * 1.3, y + size * 0.3, size * 0.38, jitter);
  }
}
