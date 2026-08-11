/**
 * Purpose: map typography — supersampled handwriting labels with land-toned halos,
 * retention dimming, and adaptive sizing: every name is scaled to fit the width of the
 * place it names (island diameter, kingdom span) within a readable px range.
 * Main exports: makeFittedLabel, labelDim, counterScaleLabels, FittedLabel, LabelFit.
 */
import { Text, TextStyle } from "pixi.js";
import { mapTheme } from "./mapTheme";

/** Names rasterize at 3x their largest on-screen size, then scale down — no soft edges. */
const LABEL_SUPERSAMPLE = 3;

/** How much room the name has and how big it may render on screen (px). */
export interface LabelFit {
  /** World-unit width the rendered name must stay inside. */
  availableWorldWidth: number;
  minScreenSize: number;
  maxScreenSize: number;
}

export interface FittedLabel {
  text: Text;
  fit: LabelFit;
  /** Estimated rendered width as a multiple of the font size (letter spacing included). */
  widthPerFontSize: number;
}

/** Fog dims a name through this factor but never below a readable floor. */
export function labelDim(retention: number): number {
  return 0.72 + 0.28 * retention;
}

export interface LabelOptions {
  /** Letter spacing as a fraction of the font size, so it scales with the fitted name. */
  letterSpacingRatio?: number;
  italic?: boolean;
  onTap?: () => void;
}

/**
 * Width estimate: full-width CJK counts as one em-ish unit, latin/digits/punctuation as
 * 0.55, times the 0.62 average glyph width of the handwriting face, plus letter spacing.
 */
function widthPerFontSize(content: string, letterSpacingRatio: number): number {
  const characters = [...content];
  const units = characters.reduce(
    (sum, character) => sum + ((character.codePointAt(0) ?? 0) > 0x2e80 ? 1 : 0.55),
    0,
  );
  return Math.max(0.62 * units + letterSpacingRatio * characters.length, 0.1);
}

/**
 * Rasterizes at the fit's largest allowed size, so counterScaleLabels only ever scales
 * down — a fitted name never turns soft.
 */
export function makeFittedLabel(
  content: string,
  fit: LabelFit,
  alpha: number,
  options?: LabelOptions,
): FittedLabel {
  const letterSpacingRatio = options?.letterSpacingRatio ?? 0;
  const text = new Text({
    text: content,
    style: new TextStyle({
      fontFamily: mapTheme.fontFamily,
      fontSize: fit.maxScreenSize * LABEL_SUPERSAMPLE,
      fill: mapTheme.ink,
      fontStyle: options?.italic === true ? "italic" : "normal",
      letterSpacing: letterSpacingRatio * fit.maxScreenSize * LABEL_SUPERSAMPLE,
      // Land-toned halo keeps names legible over any terrain ink.
      stroke: { color: mapTheme.landFill, width: 1.2 * LABEL_SUPERSAMPLE, join: "round" },
    }),
  });
  text.scale.set(1 / LABEL_SUPERSAMPLE);
  text.anchor.set(0.5);
  text.alpha = alpha;
  if (options?.onTap !== undefined) {
    text.eventMode = "static";
    text.cursor = "pointer";
    text.on("pointertap", options.onTap);
  }
  return { text, fit, widthPerFontSize: widthPerFontSize(content, letterSpacingRatio) };
}

/**
 * Called once per level change. The level's camera scale is fixed (no free zoom), so the
 * fit is exact: the place's world-unit width becomes a screen width, the name takes the
 * largest px size that stays inside it, and the clamp keeps it readable either way.
 */
export function counterScaleLabels(labels: readonly FittedLabel[], cameraScale: number): void {
  for (const label of labels) {
    const availableScreenWidth = label.fit.availableWorldWidth * Math.max(cameraScale, 1e-6);
    const screenSize = Math.min(
      Math.max(availableScreenWidth / label.widthPerFontSize, label.fit.minScreenSize),
      label.fit.maxScreenSize,
    );
    const renderedSize = label.text.style.fontSize;
    label.text.scale.set(screenSize / (renderedSize * Math.max(cameraScale, 1e-6)));
  }
}
