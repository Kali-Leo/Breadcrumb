/**
 * Purpose: the map life layer — chimney smoke, strolling ink cats and the compass rose
 * (art bible docs/vision/05). Deterministic per place (seeded phases), animated
 * by a time parameter. No learning semantics; charm only.
 * Main exports: drawSmoke, drawCats, drawCompassRose.
 */
import type { MapPlace } from "@breadcrumb/plugin-map";

const INK = "#4a3f35";

function placePhase(place: MapPlace): number {
  let hash = 0;
  for (const char of place.name) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return hash;
}

/** A breathing cycle of 2-3 smoke puffs above a building's chimney. */
export function drawSmoke(
  context: CanvasRenderingContext2D,
  place: MapPlace,
  x: number,
  y: number,
  scale: number,
  timeMs: number,
): void {
  const size = place.radius * scale;
  const cycleMs = 5200;
  const phase = ((timeMs + placePhase(place) * 37) % cycleMs) / cycleMs; // 0..1
  if (phase > 0.62) return; // resting between breaths ("偶尔")
  const chimneyX = x + size * (place.tier === "house" ? 0.28 : 0.3);
  const chimneyY = y - size * (place.tier === "house" ? 0.8 : 0.55);
  for (let puff = 0; puff < 3; puff++) {
    const puffProgress = phase * 1.6 - puff * 0.18;
    if (puffProgress <= 0 || puffProgress >= 1) continue;
    const rise = puffProgress * size * 1.1;
    const drift = Math.sin(puffProgress * Math.PI * 2 + puff) * size * 0.12;
    context.globalAlpha = 0.35 * (1 - puffProgress);
    context.strokeStyle = INK;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(
      chimneyX + drift,
      chimneyY - rise,
      (2.2 + puffProgress * 4.5) * scale,
      0.3,
      Math.PI * 2 - 0.2,
    );
    context.stroke();
  }
  context.globalAlpha = 1;
}

/** Tiny ink cats pacing along the settlement edge; cities get 2, villages 1. */
export function drawCats(
  context: CanvasRenderingContext2D,
  place: MapPlace,
  x: number,
  y: number,
  scale: number,
  timeMs: number,
): void {
  const catCount = place.tier === "city" ? 2 : place.tier === "village" ? 1 : 0;
  if (catCount === 0 || scale < 0.55) return; // too small to read as a cat — skip
  const size = place.radius * scale;
  for (let index = 0; index < catCount; index++) {
    const phase = placePhase(place) * 53 + index * 4300;
    const walk = Math.sin((timeMs + phase) / 2400); // -1..1 pacing
    const facing = Math.cos((timeMs + phase) / 2400) >= 0 ? 1 : -1;
    const catX = x + walk * size * 0.7 + (index === 1 ? size * 0.3 : 0);
    const catY = y + size * (1.06 + index * 0.14);
    drawOneCat(context, catX, catY, Math.max(3.6, 4 * scale), facing, timeMs + phase);
  }
}

function drawOneCat(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  unit: number,
  facing: number,
  timeMs: number,
): void {
  context.strokeStyle = INK;
  context.fillStyle = INK;
  context.lineWidth = Math.max(0.8, unit * 0.22);
  // body
  context.beginPath();
  context.ellipse(x, y, unit * 1.5, unit * 0.85, 0, 0, Math.PI * 2);
  context.fill();
  // head with ears
  const headX = x + facing * unit * 1.7;
  const headY = y - unit * 0.7;
  context.beginPath();
  context.arc(headX, headY, unit * 0.8, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(headX - unit * 0.55, headY - unit * 0.5);
  context.lineTo(headX - unit * 0.32, headY - unit * 1.15);
  context.lineTo(headX - unit * 0.05, headY - unit * 0.65);
  context.moveTo(headX + unit * 0.55, headY - unit * 0.5);
  context.lineTo(headX + unit * 0.32, headY - unit * 1.15);
  context.lineTo(headX + unit * 0.05, headY - unit * 0.65);
  context.fill();
  // swishing tail
  const swish = Math.sin(timeMs / 480) * unit * 0.8;
  context.beginPath();
  context.moveTo(x - facing * unit * 1.4, y);
  context.quadraticCurveTo(
    x - facing * unit * 2.6,
    y - unit * 1.2,
    x - facing * unit * 2.2,
    y - unit * 1.8 + swish * 0.4,
  );
  context.stroke();
}

/** A small hand-drawn compass rose, fixed to the top-right corner. */
export function drawCompassRose(context: CanvasRenderingContext2D, width: number): void {
  const x = width - 64;
  const y = 64;
  context.strokeStyle = "#8a7b6b";
  context.fillStyle = "#8a7b6b";
  context.lineWidth = 1.2;
  context.beginPath();
  context.arc(x, y, 26, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(x, y, 19, 0, Math.PI * 2);
  context.stroke();
  for (let point = 0; point < 8; point++) {
    const angle = (point * Math.PI) / 4;
    const length = point % 2 === 0 ? 24 : 13;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.sin(angle) * length, y - Math.cos(angle) * length);
    context.stroke();
  }
  context.font = "12px serif";
  context.textAlign = "center";
  context.fillText("N", x, y - 32);
}
