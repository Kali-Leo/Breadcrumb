/**
 * Purpose: the aged parchment — noise grain, tea stains and corner vignette, rendered
 * once to an offscreen canvas and blitted every frame (screen-fixed, world moves on it).
 * Main exports: drawParchment.
 */
import { seededRandom } from "./prng";

let cached: HTMLCanvasElement | null = null;
let cachedWidth = 0;
let cachedHeight = 0;

export function drawParchment(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  if (!cached || cachedWidth !== width || cachedHeight !== height) {
    cached = renderParchment(width, height);
    cachedWidth = width;
    cachedHeight = height;
  }
  context.drawImage(cached, 0, 0);
}

function renderParchment(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const random = seededRandom(20260729);

  context.fillStyle = "#e9dcbe";
  context.fillRect(0, 0, width, height);

  // Tea stains: big soft blotches.
  for (let stain = 0; stain < 26; stain++) {
    const x = random() * width;
    const y = random() * height;
    const radius = (0.04 + random() * 0.12) * Math.max(width, height);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(180, 155, 110, ${0.05 + random() * 0.07})`);
    gradient.addColorStop(1, "rgba(180, 155, 110, 0)");
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Fine grain speckles.
  context.fillStyle = "rgba(120, 95, 60, 0.05)";
  const speckles = Math.round((width * height) / 900);
  for (let speck = 0; speck < speckles; speck++) {
    context.fillRect(random() * width, random() * height, 1.4, 1.4);
  }

  // Corner vignette: the paper darkens toward its edges.
  const vignette = context.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.36,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  vignette.addColorStop(0, "rgba(120, 90, 50, 0)");
  vignette.addColorStop(1, "rgba(110, 80, 45, 0.28)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
  return canvas;
}
