/**
 * Purpose: map typography — supersampled handwriting labels with land-toned halos,
 * per-level counter-scaling and retention dimming (Laham ink on sepia).
 * Main exports: makeLabel, labelDim, counterScaleLabels, LabelSets.
 */
import { Text, TextStyle } from "pixi.js";
import { mapTheme } from "./mapTheme";

export const LABEL_SUPERSAMPLE = 3;

export interface LabelSets {
  islandLabels: Text[];
  kingdomLabels: Text[];
  villageLabels: Text[];
  pointLabels: Text[];
}

/** Target on-screen text height per band (px) — labels stay readable at any level. */
const SCREEN_SIZE_BY_BAND = { island: 26, kingdom: 24, village: 19, point: 14 } as const;

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
 * Called once per level change: every band's names render at their target screen
 * size under the level's fixed camera scale (no free zoom, so this is exact).
 */
export function counterScaleLabels(sets: LabelSets, cameraScale: number): void {
  const apply = (labels: readonly Text[], band: keyof typeof SCREEN_SIZE_BY_BAND): void => {
    for (const label of labels) {
      const renderedSize = label.style.fontSize;
      const factor = SCREEN_SIZE_BY_BAND[band] / (renderedSize * Math.max(cameraScale, 1e-6));
      label.scale.set(factor);
    }
  };
  apply(sets.islandLabels, "island");
  apply(sets.kingdomLabels, "kingdom");
  apply(sets.villageLabels, "village");
  apply(sets.pointLabels, "point");
}
