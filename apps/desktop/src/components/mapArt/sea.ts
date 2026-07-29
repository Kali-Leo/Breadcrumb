/**
 * Purpose: the living sea — sparse wave dashes, a kraken easter egg in open water,
 * and soft radial-gradient fog (never hides names: weather, not punishment).
 * Main exports: drawWaveField, drawKraken, drawSoftFog.
 */
import type { MapPlace } from "@breadcrumb/plugin-map";
import { INK, INK_FAINT } from "./palette";
import { hashString, seededRandom } from "./prng";

/** Sparse deterministic wave glyphs over open water (viewport-culled grid). */
export function drawWaveField(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  cameraX: number,
  cameraY: number,
  scale: number,
): void {
  const gridWorld = 300;
  context.strokeStyle = INK_FAINT;
  context.lineWidth = Math.max(0.7, scale);
  const startColumn = Math.floor((cameraX - width / 2 / scale) / gridWorld) - 1;
  const endColumn = Math.ceil((cameraX + width / 2 / scale) / gridWorld) + 1;
  const startRow = Math.floor((cameraY - height / 2 / scale) / gridWorld) - 1;
  const endRow = Math.ceil((cameraY + height / 2 / scale) / gridWorld) + 1;
  for (let column = startColumn; column <= endColumn; column++) {
    for (let row = startRow; row <= endRow; row++) {
      const hash = ((column * 73856093) ^ (row * 19349663)) >>> 0;
      if (hash % 4 !== 0) continue;
      const worldX = column * gridWorld + (hash % 150);
      const worldY = row * gridWorld + ((hash >> 5) % 150);
      const screenX = (worldX - cameraX) * scale + width / 2;
      const screenY = (worldY - cameraY) * scale + height / 2;
      context.beginPath();
      // The classic double-crest wave glyph: ﹏
      context.moveTo(screenX, screenY);
      context.quadraticCurveTo(
        screenX + 5 * scale,
        screenY - 5 * scale,
        screenX + 10 * scale,
        screenY,
      );
      context.quadraticCurveTo(
        screenX + 13 * scale,
        screenY + 2.6 * scale,
        screenX + 16 * scale,
        screenY + 1.4 * scale,
      );
      context.stroke();
    }
  }
}

/** Kraken tentacles breaking the surface — a fixed easter egg far from land. */
export function drawKraken(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  timeMs: number,
): void {
  const sway = Math.sin(timeMs / 1800) * 0.1;
  context.strokeStyle = INK;
  context.fillStyle = INK;
  context.lineWidth = Math.max(1, 1.6 * scale);
  const tentacles = [
    { dx: -34, height: 30, curl: -1 },
    { dx: -6, height: 46, curl: 1 },
    { dx: 24, height: 34, curl: -1 },
  ];
  for (const [index, tentacle] of tentacles.entries()) {
    const baseX = x + tentacle.dx * scale;
    const h = tentacle.height * scale * (1 + sway * (index % 2 === 0 ? 1 : -1));
    context.beginPath();
    context.moveTo(baseX - 6 * scale, y);
    context.quadraticCurveTo(
      baseX - 8 * scale,
      y - h * 0.7,
      baseX + tentacle.curl * 10 * scale,
      y - h,
    );
    context.quadraticCurveTo(
      baseX + tentacle.curl * 20 * scale,
      y - h * 1.05,
      baseX + tentacle.curl * 18 * scale,
      y - h * 0.78,
    );
    context.quadraticCurveTo(baseX + 8 * scale, y - h * 0.55, baseX + 6 * scale, y);
    context.closePath();
    context.fill();
    // Water ring at the base
    context.beginPath();
    context.arc(baseX, y + 2 * scale, 10 * scale, 0.2, Math.PI - 0.3);
    context.stroke();
  }
}

/** Layered soft fog over an under-remembered island (radial gradients, drifting). */
export function drawSoftFog(
  context: CanvasRenderingContext2D,
  place: MapPlace,
  x: number,
  y: number,
  islandR: number,
  scale: number,
  fogIntensity: number,
  timeMs: number,
): void {
  if (fogIntensity <= 0.05) return;
  const seed = hashString(place.id);
  const random = seededRandom(seed);
  const maxAlpha = Math.min(0.5, fogIntensity * 0.55);
  for (let layer = 0; layer < 5; layer++) {
    const angle = random() * Math.PI * 2;
    const distance = islandR * (0.2 + random() * 0.55);
    const drift = Math.sin(timeMs / 5200 + layer * 1.7 + (seed % 7)) * islandR * 0.12;
    const fogX = x + (Math.cos(angle) * distance + drift) * scale;
    const fogY = y + Math.sin(angle) * distance * 0.6 * scale;
    const radius = islandR * (0.55 + random() * 0.35) * scale;
    const gradient = context.createRadialGradient(fogX, fogY, 0, fogX, fogY, radius);
    gradient.addColorStop(0, `rgba(226, 216, 194, ${maxAlpha})`);
    gradient.addColorStop(1, "rgba(226, 216, 194, 0)");
    context.fillStyle = gradient;
    context.fillRect(fogX - radius, fogY - radius, radius * 2, radius * 2);
  }
}
