/**
 * Purpose: draw orchestration for the fantasy chart — parchment, sea, islands with
 * settlements, fog of forgetting, kraken easter egg, compass rose, and the close-up
 * interior view. Art bible: docs/vision/05.
 * Main exports: drawMap, findPlaceAt, findNodeAt, Camera, CLOSE_UP_SCALE.
 */
import type { MapPlace } from "@breadcrumb/plugin-map";
import rough from "roughjs";
import { drawIsland, islandRadius } from "./mapArt/island";
import { INK, INK_FAINT, INK_SOFT, LABEL_FONT, PAPER_SAND } from "./mapArt/palette";
import { drawParchment } from "./mapArt/parchment";
import { hashString } from "./mapArt/prng";
import { drawKraken, drawSoftFog, drawWaveField } from "./mapArt/sea";
import { drawSettlement } from "./mapArt/settlement";
import { drawCats, drawCompassRose, drawSmoke } from "./mapDecorations";

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

/** Above this zoom, places open up and show their inner knowledge structure. */
export const CLOSE_UP_SCALE = 1.5;

/** The kraken guards a fixed spot in open water. */
const KRAKEN_WORLD = { x: 420, y: 460 };

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
    if (distance <= (islandRadius(place) + 12) * camera.scale) return place;
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
  const scale = camera.scale * ratio;
  const view = { width: canvas.width, height: canvas.height } as HTMLCanvasElement;

  drawParchment(context, canvas.width, canvas.height);
  drawWaveField(context, canvas.width, canvas.height, camera.x, camera.y, scale);

  const kraken = worldToScreen({ ...camera, scale }, view, KRAKEN_WORLD.x, KRAKEN_WORLD.y);
  drawKraken(context, kraken.x, kraken.y, scale, timeMs);

  const closeUp = camera.scale >= CLOSE_UP_SCALE;
  const roughCanvas = rough.canvas(canvas);
  for (const place of places) {
    const center = worldToScreen({ ...camera, scale }, view, place.x, place.y);
    const memberRetentions = place.nodeIds.map((nodeId) => retentionByNode.get(nodeId) ?? 1);
    const averageRetention =
      memberRetentions.reduce((sum, value) => sum + value, 0) /
      Math.max(1, memberRetentions.length);

    drawIsland(context, place, center.x, center.y, scale);
    if (closeUp) {
      drawInterior(
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
      drawSettlement(context, place, center.x, center.y, scale);
      drawSmoke(context, place, center.x, center.y, scale, timeMs);
      drawCats(context, place, center.x, center.y, scale, timeMs);
      drawLabel(context, place, center.x, center.y, scale);
      drawSoftFog(
        context,
        place,
        center.x,
        center.y,
        islandRadius(place),
        scale,
        1 - averageRetention,
        timeMs,
      );
    }
  }
  drawCompassRose(context, canvas.width);
}

/** Place name in handwriting, with the knowledge count as a small subtitle. */
function drawLabel(
  context: CanvasRenderingContext2D,
  place: MapPlace,
  x: number,
  y: number,
  scale: number,
): void {
  const offset = islandRadius(place) * scale;
  context.fillStyle = INK;
  context.textAlign = "center";
  context.font = `${Math.max(13, 17 * scale)}px ${LABEL_FONT}`;
  context.fillText(place.name, x, y + offset + 20 * scale);
  if (place.nodeIds.length > 1) {
    context.font = `${Math.max(9, 10.5 * scale)}px ${LABEL_FONT}`;
    context.fillStyle = INK_SOFT;
    context.fillText(`${place.nodeIds.length} 个知识点`, x, y + offset + 36 * scale);
  }
}

/** Close-up: member knowledge nodes on the island, ink fading with memory. */
function drawInterior(
  roughCanvas: ReturnType<typeof rough.canvas>,
  context: CanvasRenderingContext2D,
  place: MapPlace,
  x: number,
  y: number,
  scale: number,
  nodeLabels: ReadonlyMap<string, string>,
  retentionByNode: ReadonlyMap<string, number>,
): void {
  const seed = 1 + (hashString(place.id) % 1000);
  context.fillStyle = INK_FAINT;
  context.textAlign = "center";
  context.font = `${Math.max(11, 12 * scale)}px ${LABEL_FONT}`;
  context.fillText(place.name, x, y - islandRadius(place) * scale - 10 * scale);

  for (const member of place.internal) {
    const nodeX = x + member.dx * scale;
    const nodeY = y + member.dy * scale;
    const retention = retentionByNode.get(member.nodeId) ?? 1;
    context.globalAlpha = 0.35 + retention * 0.65;
    roughCanvas.circle(nodeX, nodeY, 9 * scale, {
      stroke: INK,
      strokeWidth: 1.2,
      roughness: 1.2,
      seed: seed + member.nodeId.length,
      fill: PAPER_SAND,
      fillStyle: "solid",
    });
    context.fillStyle = INK;
    context.font = `${Math.max(11, 12.5 * scale)}px ${LABEL_FONT}`;
    context.fillText(nodeLabels.get(member.nodeId) ?? "…", nodeX, nodeY + 18 * scale);
    context.globalAlpha = 1;
  }
}
