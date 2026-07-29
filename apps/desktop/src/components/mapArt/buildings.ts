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

/** Castle: delicate keep with hatched roof flanked by two slim conical towers,
 * tiny pennants, fine unified line weight (微观建筑参考 castles are light, not heavy). */
export function drawCastle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  jitter: Jitter,
): void {
  context.strokeStyle = INK;
  context.fillStyle = PAPER_SAND;
  context.lineWidth = Math.max(0.9, size * 0.05);

  // Central keep: rectangle + pitched hatched roof (same language as huts).
  const keepW = size * 0.56;
  const keepH = size * 0.62;
  context.beginPath();
  context.rect(x - keepW / 2 + j(jitter, 1.5), y - keepH, keepW, keepH);
  context.fill();
  context.stroke();
  const peakY = y - keepH - size * 0.34;
  context.beginPath();
  context.moveTo(x - keepW * 0.62, y - keepH);
  context.lineTo(x + j(jitter, 2), peakY);
  context.lineTo(x + keepW * 0.62, y - keepH);
  context.stroke();
  for (let line = 1; line <= 2; line++) {
    const t = line / 3;
    const hatchY = y - keepH + (peakY - (y - keepH)) * t;
    context.beginPath();
    context.moveTo(x - keepW * 0.62 * (1 - t), hatchY);
    context.lineTo(x + keepW * 0.62 * (1 - t), hatchY);
    context.stroke();
  }
  // Keep door + window
  context.beginPath();
  context.arc(x, y, keepW * 0.18, Math.PI, 0);
  context.stroke();
  context.beginPath();
  context.arc(x, y - keepH * 0.62, keepW * 0.1, 0, Math.PI * 2);
  context.stroke();

  // Two slim flanking towers with conical roofs and pennants.
  for (const side of [-1, 1]) {
    const towerX = x + side * size * 0.52;
    const towerW = size * 0.2;
    const towerH = size * 0.52;
    context.beginPath();
    context.rect(towerX - towerW / 2 + j(jitter, 1), y - towerH, towerW, towerH);
    context.fill();
    context.stroke();
    const roofY = y - towerH - size * 0.24;
    context.beginPath();
    context.moveTo(towerX - towerW * 0.75, y - towerH);
    context.lineTo(towerX + j(jitter, 1.5), roofY);
    context.lineTo(towerX + towerW * 0.75, y - towerH);
    context.closePath();
    context.fill();
    context.stroke();
    // Pennant: a tiny fluttering line-flag
    context.beginPath();
    context.moveTo(towerX, roofY);
    context.lineTo(towerX, roofY - size * 0.14);
    context.quadraticCurveTo(
      towerX + side * size * 0.12,
      roofY - size * 0.15,
      towerX + side * size * 0.1,
      roofY - size * 0.09,
    );
    context.stroke();
    // Slit window
    context.beginPath();
    context.moveTo(towerX, y - towerH * 0.6);
    context.lineTo(towerX, y - towerH * 0.4);
    context.stroke();
  }
}
