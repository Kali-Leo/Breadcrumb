/**
 * Purpose: map typography — supersampled handwriting names with land-toned halos and
 * retention dimming, each rendered at the one fixed on-screen size its class was given
 * (mapLabelPlacement moves names apart instead of shrinking them).
 * Main exports: makeMapLabel, labelDim, counterScaleLabels, MapLabel.
 */
import { Text, TextStyle } from "pixi.js";
import { mapTheme } from "./mapTheme";

/** Names rasterize at 3x their on-screen size, then scale down — no soft edges. */
const LABEL_SUPERSAMPLE = 3;

/** Characters whose handwriting slice has already been asked for, so a name built from
 * characters already in hand is never re-rasterized. */
const requestedCodepoints = new Set<number>();

/**
 * The handwriting font ships as unicode-range slices, and a browser only fetches a slice when
 * it lays out DOM text in it. Pixi rasterizes through canvas, which draws with whatever faces
 * are already loaded and never fetches anything itself — so a name whose slice had not been
 * pulled in would come out in the serif fallback and stay there. Ask for exactly the slices
 * this name needs, then redraw once they land: assigning the text again is what dirties Pixi's
 * cached texture. Both assignments happen in the same task, so nothing blank is ever shown.
 */
function withHandwriting(label: MapLabel, content: string): MapLabel {
  const missing = [...content].map((char) => char.codePointAt(0) ?? 0);
  if (missing.every((codepoint) => requestedCodepoints.has(codepoint))) return label;
  for (const codepoint of missing) requestedCodepoints.add(codepoint);
  if (typeof document === "undefined") return label;
  void document.fonts
    .load(`${label.screenSize}px ${mapTheme.fontFamily}`, content)
    .then(() => {
      if (label.text.destroyed) return;
      const drawn = label.text.text;
      label.text.text = "";
      label.text.text = drawn;
    })
    // Best-effort, exactly as the first font load is: the serif fallback stays readable.
    .catch(() => {});
  return label;
}

export interface MapLabel {
  /** Which island/kingdom this name belongs to — hover emphasis looks names up by it. */
  nodeId: string;
  text: Text;
  /** On-screen px size this name keeps at every camera scale. */
  screenSize: number;
  /** The retention-dimmed alpha the name returns to when hover emphasis leaves it. */
  baseAlpha: number;
}

/** Fog dims a name through this factor but never below a readable floor. */
export function labelDim(retention: number): number {
  return 0.72 + 0.28 * retention;
}

export interface LabelOptions {
  /** Letter spacing as a fraction of the font size, so it scales with the name. */
  letterSpacingRatio?: number;
  italic?: boolean;
}

/**
 * Rasterizes at the supersampled size, so counterScaleLabels only ever scales down — a
 * name never turns soft.
 */
export function makeMapLabel(
  nodeId: string,
  content: string,
  screenSize: number,
  alpha: number,
  options?: LabelOptions,
): MapLabel {
  const letterSpacingRatio = options?.letterSpacingRatio ?? 0;
  const text = new Text({
    text: content,
    style: new TextStyle({
      fontFamily: mapTheme.fontFamily,
      fontSize: screenSize * LABEL_SUPERSAMPLE,
      fill: mapTheme.ink,
      fontStyle: options?.italic === true ? "italic" : "normal",
      letterSpacing: letterSpacingRatio * screenSize * LABEL_SUPERSAMPLE,
      // Land-toned halo keeps names legible over any terrain ink.
      stroke: { color: mapTheme.landFill, width: 1.2 * LABEL_SUPERSAMPLE, join: "round" },
    }),
  });
  text.scale.set(1 / LABEL_SUPERSAMPLE);
  text.anchor.set(0.5);
  text.alpha = alpha;
  return withHandwriting({ nodeId, text, screenSize, baseAlpha: alpha }, content);
}

/**
 * Called once per level change: the world container's scale is cancelled out so every name
 * renders at exactly its class's px size, whichever level the camera is at.
 */
export function counterScaleLabels(labels: readonly MapLabel[], cameraScale: number): void {
  for (const label of labels) {
    const renderedSize = label.text.style.fontSize;
    label.text.scale.set(label.screenSize / (renderedSize * Math.max(cameraScale, 1e-6)));
  }
}

/** Hover emphasis: the hovered feature's name flips to the accent ink so a name that had
 * to drift into open water still points back at its land unmistakably. Writes are guarded:
 * assigning style.fill dirties the Text even with an unchanged value, and re-rasterizing
 * all supersampled names on every hover change is a visible frame hitch. */
export function setLabelEmphasis(labels: readonly MapLabel[], nodeId: string | null): void {
  for (const label of labels) {
    const emphasized = label.nodeId === nodeId;
    const fill = emphasized ? mapTheme.labelEmphasis : mapTheme.ink;
    if (label.text.style.fill !== fill) label.text.style.fill = fill;
    const alpha = emphasized ? 1 : label.baseAlpha;
    if (label.text.alpha !== alpha) label.text.alpha = alpha;
  }
}
