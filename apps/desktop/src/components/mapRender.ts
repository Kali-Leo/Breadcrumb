/**
 * Purpose: pure canvas drawing for the ink chart — paper texture tone, rough.js
 * hand-drawn places (house/village/city), name labels, LOD (member labels when zoomed).
 * Main exports: drawMap, findPlaceAt, Camera.
 */
import type { MapPlace } from "@breadcrumb/plugin-map";
import rough from "roughjs";

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

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

export function drawMap(
  canvas: HTMLCanvasElement,
  places: readonly MapPlace[],
  camera: Camera,
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

  for (const place of places) {
    const center = worldToScreen(
      { ...camera, scale },
      { width: canvas.width, height: canvas.height } as HTMLCanvasElement,
      place.x,
      place.y,
    );
    drawPlace(roughCanvas, context, place, center.x, center.y, scale);
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
