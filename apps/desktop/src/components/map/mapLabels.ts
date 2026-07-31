/**
 * Purpose: map typography — supersampled handwriting labels with land-toned halos,
 * per-level counter-scaling and retention dimming (Laham ink on sepia).
 * Main exports: makeLabel, labelDim, counterScaleLabels, LabelSets.
 */
import { Text, TextStyle } from "pixi.js";
import { mapTheme } from "./mapTheme";

export const LABEL_SUPERSAMPLE = 3;

export interface LabelSets {
  islandLabels: { label: Text; islandRadius: number }[];
  kingdomLabelTexts: Text[];
}

/** Fog dims a name through this factor but never below a readable floor. */
export function labelDim(retention: number): number {
  return 0.72 + 0.28 * retention;
}

export interface LabelOptions {
  letterSpacing?: number;
  italic?: boolean;
  onTap?: () => void;
}

export function makeLabel(
  text: string,
  fontSize: number,
  alpha: number,
  options?: LabelOptions,
): Text {
  const label = new Text({
    text,
    style: new TextStyle({
      fontFamily: mapTheme.fontFamily,
      fontSize: fontSize * LABEL_SUPERSAMPLE,
      fill: mapTheme.ink,
      fontStyle: options?.italic === true ? "italic" : "normal",
      letterSpacing: (options?.letterSpacing ?? 0) * LABEL_SUPERSAMPLE,
      // Land-toned halo keeps names legible over any terrain ink.
      stroke: { color: mapTheme.landFill, width: 1.2 * LABEL_SUPERSAMPLE, join: "round" },
    }),
  });
  label.scale.set(1 / LABEL_SUPERSAMPLE);
  label.anchor.set(0.5);
  label.alpha = alpha;
  if (options?.onTap !== undefined) {
    label.eventMode = "static";
    label.cursor = "pointer";
    label.on("pointertap", options.onTap);
  }
  return label;
}

/**
 * Called once per level change: island and kingdom names render at a readable
 * screen size for the level's fixed camera scale.
 */
export function counterScaleLabels(sets: LabelSets, cameraScale: number): void {
  for (const { label, islandRadius } of sets.islandLabels) {
    const cap = 1.6 + islandRadius / 110;
    const factor = Math.min(Math.max(1 / cameraScale, 1), cap) / LABEL_SUPERSAMPLE;
    label.scale.set(factor);
  }
  const kingdomFactor = Math.min(Math.max(1 / cameraScale, 1), 1.8) / LABEL_SUPERSAMPLE;
  for (const label of sets.kingdomLabelTexts) {
    label.scale.set(kingdomFactor);
  }
}
