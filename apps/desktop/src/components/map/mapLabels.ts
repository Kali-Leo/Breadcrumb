/**
 * Purpose: map typography — supersampled handwriting labels with land-toned halos,
 * zoom counter-scaling, retention dimming and ribbon banners behind settlement names.
 * Main exports: makeLabel, labelDim, counterScaleLabels, addBannerBehind, LabelSets.
 */
import { type Container, Graphics, Text, TextStyle } from "pixi.js";
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
 * Keeps place names readable across zoom: island names hold a near-constant screen
 * size capped by island radius, kingdom names get a gentle far-out boost.
 */
export function counterScaleLabels(sets: LabelSets, viewportScale: number): void {
  for (const { label, islandRadius } of sets.islandLabels) {
    const cap = 1.6 + islandRadius / 110;
    const factor = Math.min(Math.max(1 / viewportScale, 1), cap) / LABEL_SUPERSAMPLE;
    label.scale.set(factor);
  }
  const kingdomFactor = Math.min(Math.max(1 / viewportScale, 1), 1.8) / LABEL_SUPERSAMPLE;
  for (const label of sets.kingdomLabelTexts) {
    label.scale.set(kingdomFactor);
  }
}

/** A swallow-tailed ribbon behind a label — the Marauder's-map name plate. */
export function addBannerBehind(container: Container, label: Text): void {
  const width = label.width + 12;
  const height = label.height + 5;
  const { x, y } = label.position;
  const banner = new Graphics();
  const tail = 8;
  banner.poly(
    [
      { x: x - width / 2, y: y - height / 2 },
      { x: x + width / 2, y: y - height / 2 },
      { x: x + width / 2 + tail, y: y - height / 2 + 1 },
      { x: x + width / 2 + tail - 4, y },
      { x: x + width / 2 + tail, y: y + height / 2 - 1 },
      { x: x + width / 2, y: y + height / 2 },
      { x: x - width / 2, y: y + height / 2 },
      { x: x - width / 2 - tail, y: y + height / 2 - 1 },
      { x: x - width / 2 - tail + 4, y },
      { x: x - width / 2 - tail, y: y - height / 2 + 1 },
    ],
    true,
  );
  banner.fill({ color: 0xfdf8ec, alpha: 0.85 });
  banner.stroke({ width: 1.1, color: mapTheme.ink, alpha: 0.65, join: "round" });
  container.addChild(banner);
}
