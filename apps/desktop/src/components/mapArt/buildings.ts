/**
 * Purpose: settlement sketches — hut, village, castle town, plus trees and bushes,
 * drawn with a few loose but structured ink strokes (微观建筑参考 style).
 * All shapes take a jitter() from the caller's PRNG so每座建筑笔迹独特而稳定.
 * Main exports: drawHut, drawPineTree, drawRoundTree, drawCastle.
 */
import { INK, INK_SOFT, PAPER_SAND } from "./palette";

type Jitter = () => number;

function j(jitter: Jitter, amount: number): number {
  return (jitter() - 0.5) * amount;
}

/** A pointed-roof hut with door, window, chimney and roof hatching. */
export function drawHut(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  jitter: Jitter,
): void {
  const w = size;
  const h = size * 0.72;
  context.strokeStyle = INK;
  context.fillStyle = PAPER_SAND;
  context.lineWidth = Math.max(0.9, size * 0.055);

  // Walls
  context.beginPath();
  context.moveTo(x - w / 2 + j(jitter, 2), y);
  context.lineTo(x - w / 2 + j(jitter, 2), y - h);
  context.lineTo(x + w / 2 + j(jitter, 2), y - h + j(jitter, 2));
  context.lineTo(x + w / 2 + j(jitter, 2), y);
  context.closePath();
  context.fill();
  context.stroke();

  // Roof triangle with overhang + hatching
  const peakY = y - h - size * 0.55;
  context.beginPath();
  context.moveTo(x - w * 0.62, y - h + j(jitter, 2));
  context.lineTo(x + j(jitter, 3), peakY);
  context.lineTo(x + w * 0.62, y - h + j(jitter, 2));
  context.stroke();
  for (let line = 1; line <= 3; line++) {
    const t = line / 4;
    const hatchY = y - h + (peakY - (y - h)) * t;
    context.beginPath();
    context.moveTo(x - w * 0.62 * (1 - t) + j(jitter, 1.5), hatchY);
    context.lineTo(x + w * 0.62 * (1 - t), hatchY);
    context.stroke();
  }

  // Chimney
  context.beginPath();
  context.rect(
    x + w * 0.22,
    peakY + (y - h - peakY) * 0.35 - size * 0.22,
    size * 0.14,
    size * 0.26,
  );
  context.fill();
  context.stroke();

  // Door + window
  context.beginPath();
  context.rect(x - size * 0.1, y - h * 0.52, size * 0.2, h * 0.52);
  context.stroke();
  context.beginPath();
  context.rect(x + w * 0.16, y - h * 0.78, size * 0.16, size * 0.16);
  context.stroke();
  context.beginPath();
  context.moveTo(x + w * 0.16, y - h * 0.7);
  context.lineTo(x + w * 0.16 + size * 0.16, y - h * 0.7);
  context.moveTo(x + w * 0.24, y - h * 0.78);
  context.lineTo(x + w * 0.24, y - h * 0.78 + size * 0.16);
  context.stroke();
}

/** Layered triangle pine (小元素参考). */
export function drawPineTree(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  jitter: Jitter,
): void {
  context.strokeStyle = INK_SOFT;
  context.lineWidth = Math.max(0.8, size * 0.06);
  for (let layer = 0; layer < 3; layer++) {
    const layerY = y - layer * size * 0.34;
    const layerW = size * (0.62 - layer * 0.16);
    context.beginPath();
    context.moveTo(x - layerW + j(jitter, 2), layerY);
    context.lineTo(x + j(jitter, 1.5), layerY - size * 0.42);
    context.lineTo(x + layerW + j(jitter, 2), layerY);
    context.stroke();
  }
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x, y + size * 0.18);
  context.stroke();
}

/** Round-crown tree: trunk + a bumpy cloud crown. */
export function drawRoundTree(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  jitter: Jitter,
): void {
  context.strokeStyle = INK_SOFT;
  context.lineWidth = Math.max(0.8, size * 0.06);
  context.beginPath();
  context.moveTo(x, y + size * 0.2);
  context.lineTo(x + j(jitter, 1.5), y - size * 0.25);
  context.stroke();
  context.beginPath();
  const bumps = 7;
  for (let bump = 0; bump <= bumps; bump++) {
    const angle = (bump / bumps) * Math.PI * 2;
    const r = size * (0.42 + jitter() * 0.1);
    const bumpX = x + Math.cos(angle) * r;
    const bumpY = y - size * 0.5 + Math.sin(angle) * r * 0.8;
    if (bump === 0) context.moveTo(bumpX, bumpY);
    else
      context.quadraticCurveTo(
        x + Math.cos(angle - Math.PI / bumps) * r * 1.25,
        y - size * 0.5 + Math.sin(angle - Math.PI / bumps) * r,
        bumpX,
        bumpY,
      );
  }
  context.stroke();
}

/** Castle town: wall, gate, two flag towers and a keep (微观建筑参考 castles). */
export function drawCastle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  jitter: Jitter,
): void {
  context.strokeStyle = INK;
  context.fillStyle = PAPER_SAND;
  context.lineWidth = Math.max(1, size * 0.045);
  const wallW = size * 1.5;
  const wallH = size * 0.5;

  // Wall with battlements
  context.beginPath();
  context.moveTo(x - wallW / 2, y);
  context.lineTo(x - wallW / 2 + j(jitter, 2), y - wallH);
  for (let tooth = 0; tooth < 6; tooth++) {
    const toothX = x - wallW / 2 + (wallW / 6) * tooth;
    context.lineTo(toothX + wallW / 12, y - wallH - size * 0.09);
    context.lineTo(toothX + wallW / 12, y - wallH);
    context.lineTo(toothX + wallW / 6, y - wallH);
  }
  context.lineTo(x + wallW / 2, y);
  context.closePath();
  context.fill();
  context.stroke();

  // Gate
  context.beginPath();
  context.arc(x, y, size * 0.22, Math.PI, 0);
  context.lineTo(x + size * 0.22, y);
  context.stroke();

  // Two side towers with flags + central keep
  for (const side of [-1, 1]) {
    const towerX = x + side * wallW * 0.42;
    towerWithFlag(context, towerX, y - wallH, size * 0.34, size * 0.85, side, jitter);
  }
  towerWithFlag(context, x + j(jitter, 3), y - wallH, size * 0.46, size * 1.15, 1, jitter);
}

function towerWithFlag(
  context: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  width: number,
  height: number,
  flagSide: number,
  jitter: Jitter,
): void {
  context.beginPath();
  context.rect(x - width / 2 + j(jitter, 1.5), baseY - height, width, height);
  context.fill();
  context.stroke();
  const roofY = baseY - height - width * 0.9;
  context.beginPath();
  context.moveTo(x - width * 0.68, baseY - height);
  context.lineTo(x + j(jitter, 2), roofY);
  context.lineTo(x + width * 0.68, baseY - height);
  context.closePath();
  context.fill();
  context.stroke();
  // Flag
  context.beginPath();
  context.moveTo(x, roofY);
  context.lineTo(x, roofY - width * 0.8);
  context.lineTo(x + flagSide * width * 0.7, roofY - width * 0.62);
  context.lineTo(x, roofY - width * 0.44);
  context.stroke();
  // Window
  context.beginPath();
  context.arc(x, baseY - height * 0.55, width * 0.14, 0, Math.PI * 2);
  context.stroke();
}
