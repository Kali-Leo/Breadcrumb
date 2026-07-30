/**
 * Purpose: bridge rough.js hand-drawn geometry into Pixi — the rough generator emits
 * renderer-agnostic op sequences which we replay onto a Graphics path. Seeded, so
 * every sketchy line is deterministic.
 * Main exports: strokeRoughPolygon, strokeRoughLine.
 */
import type { Graphics } from "pixi.js";
import rough from "roughjs";
import type { InkStroke } from "./drawPrimitives";

const generator = rough.generator();

interface RoughLook {
  seed: number;
  roughness: number;
  bowing?: number;
  /** false draws the classic double sketch pass. */
  singleStroke?: boolean;
}

function replayDrawableStroke(
  graphics: Graphics,
  drawable: ReturnType<typeof generator.polygon>,
  style: InkStroke,
): void {
  for (const set of drawable.sets) {
    if (set.type !== "path") continue;
    for (const op of set.ops) {
      const data = op.data;
      if (op.op === "move") {
        graphics.moveTo(data[0] ?? 0, data[1] ?? 0);
      } else if (op.op === "lineTo") {
        graphics.lineTo(data[0] ?? 0, data[1] ?? 0);
      } else if (op.op === "bcurveTo") {
        graphics.bezierCurveTo(
          data[0] ?? 0,
          data[1] ?? 0,
          data[2] ?? 0,
          data[3] ?? 0,
          data[4] ?? 0,
          data[5] ?? 0,
        );
      }
    }
    graphics.stroke(style);
  }
}

export function strokeRoughPolygon(
  graphics: Graphics,
  points: readonly { x: number; y: number }[],
  look: RoughLook,
  style: InkStroke,
): void {
  if (points.length < 3) return;
  const drawable = generator.polygon(
    points.map((point) => [point.x, point.y] as [number, number]),
    {
      seed: Math.max(1, look.seed % 2 ** 31),
      roughness: look.roughness,
      bowing: look.bowing ?? 1,
      disableMultiStroke: look.singleStroke === true,
      stroke: "none",
      fill: undefined,
    },
  );
  replayDrawableStroke(graphics, drawable, style);
}

export function strokeRoughLine(
  graphics: Graphics,
  points: readonly { x: number; y: number }[],
  look: RoughLook,
  style: InkStroke,
): void {
  if (points.length < 2) return;
  const drawable = generator.linearPath(
    points.map((point) => [point.x, point.y] as [number, number]),
    {
      seed: Math.max(1, look.seed % 2 ** 31),
      roughness: look.roughness,
      bowing: look.bowing ?? 1,
      disableMultiStroke: look.singleStroke === true,
      stroke: "none",
    },
  );
  replayDrawableStroke(graphics, drawable, style);
}
