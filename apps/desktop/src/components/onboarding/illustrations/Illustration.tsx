/**
 * Purpose: the frame and palette every opening slide's picture is drawn with. The pictures
 * are simplified views of the app's own pages — blocks, lines and dots, never a word — so one
 * drawing serves all eleven interface languages and reads the same in each of them.
 *
 * Colours are the product's own: the amber the interface uses for anything active, the
 * stone greys of its chrome, and the parchment and land of the map.
 * Main exports: Illustration, INK.
 */
import type { ReactNode } from "react";

export const INK = {
  amber: "#f59e0b",
  amberDeep: "#d97706",
  amberSoft: "#fcd34d",
  amberPale: "#fde68a",
  cream: "#fef3c7",
  white: "#ffffff",
  stone100: "#f5f5f4",
  stone200: "#e7e5e4",
  stone300: "#d6d3d1",
  stone400: "#a8a29e",
  stone500: "#78716c",
  green: "#34d399",
  parchment: "#e9e2cf",
  land: "#d8ccae",
  mapInk: "#3a3226",
} as const;

/** 16:9 so every slide's picture takes the same room, whatever it shows. */
export function Illustration({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 320 180" aria-hidden="true" focusable="false" className="h-full w-full">
      {children}
    </svg>
  );
}

/** A row of text as a soft bar, the way every picture here stands in for writing. */
export function TextLine({
  x,
  y,
  width,
  color = INK.stone300,
  height = 5,
}: {
  x: number;
  y: number;
  width: number;
  color?: string;
  height?: number;
}) {
  return <rect x={x} y={y} width={width} height={height} rx={height / 2} fill={color} />;
}
