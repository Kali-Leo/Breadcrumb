/**
 * Purpose: pure canvas drawing for the ink chart — paper texture tone, rough.js
 * hand-drawn places (house/village/city), name labels, LOD (member labels when zoomed).
 * Main exports: drawMap, findPlaceAt, Camera.
 */
import type { MapPlace } from "@breadcrumb/plugin-map";
import rough from "roughjs";
import { drawCats, drawCompassRose, drawFog, drawSeaWaves, drawSmoke } from "./mapDecorations";

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

/** Above this zoom, places open up and show their inner knowledge structure. */
export const CLOSE_UP_SCALE = 1.5;

const INK = "#4a3f35";

function worldToScreen(camera: Camera, canvas: HTMLCanvasElement, x: number, y: number) {
  return {
    x: (x - camera.x) * camera.scale + canvas.width / 2,
    y: (y - camera.y) * camera.scale + canvas.height / 2,
  };
}

export function findPlaceAt(
  places: readonly MapPlace[],
  camera: Camera,
  canvas: HTMLCanvasElement,
  screenX: number,
  screenY: number,
): MapPlace | null {
  const ratio = canvas.width / canvas.getBoundingClientRect().width || 1;
  for (const place of places) {
    const center = worldToScreen(camera, canvas, place.x, place.y);
    const distance = Math.hypot(center.x - screenX * ratio, center.y - screenY * ratio);
    if (distance <= (place.radius + 24) * camera.scale) return place;
  }
  return null;
}

/** Finds the member node marker under the pointer (close-up view only). */
export function findNodeAt(
  places: readonly MapPlace[],
  camera: Camera,
  canvas: HTMLCanvasElement,
  screenX: number,
  screenY: number,
): { placeId: string; nodeId: string } | null {
  if (camera.scale < CLOSE_UP_SCALE) return null;
  const ratio = canvas.width / canvas.getBoundingClientRect().width || 1;
  for (const place of places) {
    for (const member of place.internal) {
      const center = worldToScreen(camera, canvas, place.x + member.dx, place.y + member.dy);
      const distance = Math.hypot(center.x - screenX * ratio, center.y - screenY * ratio);
      if (distance <= 14 * camera.scale) return { placeId: place.id, nodeId: member.nodeId };
    }
  }
  return null;
}

export function drawMap(
  canvas: HTMLCanvasElement,
  places: readonly MapPlace[],
  camera: Camera,
  nodeLabels: ReadonlyMap<string, string> = new Map(),
  timeMs = 0,
  retentionByNode: ReadonlyMap<string, number> = new Map(),
): void {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const context = canvas.getContext("2d");
  if (!context) return;

  context.fillStyle = "#f6efe0"; // aged paper
  context.fillRect(0, 0, canvas.width, canvas.height);
  const roughCanvas = rough.canvas(canvas);
  const scale = camera.scale * ratio;
  drawSeaWaves(context, canvas.width, canvas.height, camera.x, camera.y, scale);

  const closeUp = camera.scale >= CLOSE_UP_SCALE;
  for (const place of places) {
    const center = worldToScreen(
      { ...camera, scale },
      { width: canvas.width, height: canvas.height } as HTMLCanvasElement,
      place.x,
      place.y,
    );
    const memberRetentions = place.nodeIds.map((nodeId) => retentionByNode.get(nodeId) ?? 1);
    const averageRetention =
      memberRetentions.reduce((sum, value) => sum + value, 0) /
      Math.max(1, memberRetentions.length);
    if (closeUp) {
      drawPlaceInterior(
        roughCanvas,
        context,
        place,
        center.x,
        center.y,
        scale,
        nodeLabels,
        retentionByNode,
      );
    } else {
      drawPlace(roughCanvas, context, place, center.x, center.y, scale);
      drawSmoke(context, place, center.x, center.y, scale, timeMs);
      drawCats(context, place, center.x, center.y, scale, timeMs);
      drawFog(context, place, center.x, center.y, scale, 1 - averageRetention, timeMs);
    }
  }
  drawCompassRose(context, canvas.width);
}

/** Close-up view: a faint ink ring with the member knowledge nodes laid out inside. */
function drawPlaceInterior(
  roughCanvas: ReturnType<typeof rough.canvas>,
  context: CanvasRenderingContext2D,
  place: MapPlace,
  x: number,
  y: number,
  scale: number,
  nodeLabels: ReadonlyMap<string, string>,
  retentionByNode: ReadonlyMap<string, number> = new Map(),
): void {
  const seed = 1 + (place.name.charCodeAt(0) % 1000);
  const ringRadius = place.radius * 1.5 * scale;
  roughCanvas.circle(x, y, ringRadius * 2, {
    stroke: "#b5a58e",
    strokeWidth: 1.2,
    roughness: 2.2,
    seed,
  });
  context.fillStyle = "#8a7b6b";
  context.textAlign = "center";
  context.font = `${Math.max(10, 11 * scale)}px serif`;
  context.fillText(place.name, x, y - ringRadius - 8 * scale);

  for (const member of place.internal) {
    const nodeX = x + member.dx * scale;
    const nodeY = y + member.dy * scale;
    // Memory as ink: well-remembered nodes are crisp, fading ones grow pale.
    const retention = retentionByNode.get(member.nodeId) ?? 1;
    context.globalAlpha = 0.35 + retention * 0.65;
    roughCanvas.circle(nodeX, nodeY, 9 * scale, {
      stroke: INK,
      strokeWidth: 1.2,
      roughness: 1.2,
      seed: seed + member.nodeId.length,
      fill: "#e8dcc3",
      fillStyle: "solid",
    });
    context.fillStyle = INK;
    context.font = `${Math.max(10, 11 * scale)}px "Noto Serif CJK SC", serif`;
    context.fillText(nodeLabels.get(member.nodeId) ?? "…", nodeX, nodeY + 18 * scale);
    context.globalAlpha = 1;
  }
}

function drawPlace(
  roughCanvas: ReturnType<typeof rough.canvas>,
  context: CanvasRenderingContext2D,
  place: MapPlace,
  x: number,
  y: number,
  scale: number,
): void {
  const size = place.radius * scale;
  const seed = 1 + (place.name.charCodeAt(0) % 1000); // stable sketchiness per place
  const options = { stroke: INK, strokeWidth: 1.4, roughness: 1.6, seed, fill: "#e8dcc3" };

  if (place.tier === "house") {
    roughCanvas.rectangle(x - size * 0.45, y - size * 0.35, size * 0.9, size * 0.7, options);
    roughCanvas.path(
      `M ${x - size * 0.55} ${y - size * 0.35} L ${x} ${y - size * 0.85} L ${x + size * 0.55} ${y - size * 0.35}`,
      { ...options, fill: undefined },
    );
  } else if (place.tier === "village") {
    roughCanvas.circle(x, y, size * 1.5, { ...options, fillStyle: "hachure" });
    roughCanvas.rectangle(x - size * 0.5, y - size * 0.3, size * 0.45, size * 0.5, options);
    roughCanvas.rectangle(x + size * 0.08, y - size * 0.42, size * 0.5, size * 0.62, options);
  } else {
    roughCanvas.circle(x, y, size * 1.9, { ...options, fillStyle: "hachure" });
    roughCanvas.rectangle(x - size * 0.62, y - size * 0.3, size * 0.4, size * 0.62, options);
    roughCanvas.rectangle(x - size * 0.12, y - size * 0.6, size * 0.42, size * 0.92, options);
    roughCanvas.rectangle(x + size * 0.36, y - size * 0.4, size * 0.36, size * 0.72, options);
  }

  context.fillStyle = INK;
  context.textAlign = "center";
  context.font = `${Math.max(11, 13 * scale)}px "Noto Serif CJK SC", serif`;
  context.fillText(place.name, x, y + size + 16 * scale);
  const memberCount = place.nodeIds.length;
  if (memberCount > 1) {
    context.font = `${Math.max(9, 10 * scale)}px serif`;
    context.fillStyle = "#8a7b6b";
    context.fillText(`${memberCount} 个知识点`, x, y + size + 30 * scale);
  }
}
