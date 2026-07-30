/**
 * Purpose: the single source of the map's visual language — parchment/ink palette,
 * typography and semantic zoom band thresholds. Style changes happen here only.
 * Main exports: mapTheme, ZOOM_BANDS, ZOOM_PRESETS.
 */

export const mapTheme = {
  parchment: 0xf3ead8,
  ink: 0x3a2f22,
  inkSoft: 0x6b5a44,
  landFill: 0xeee1c4,
  /** Low-saturation territory tints, indexed by KingdomModel.tintIndex. */
  kingdomTints: [0xd9c49b, 0xc7cda6, 0xd6b9a3, 0xb7c4bb],
  fog: 0xfaf6ec,
  river: 0x4a6274,
  fontFamily: 'Georgia, "Noto Serif CJK SC", "Songti SC", serif',
  labelSizes: { island: 30, kingdom: 17, village: 12, point: 9 },
} as const;

/** Viewport scale thresholds between the three semantic zoom bands. */
export const ZOOM_BANDS = {
  /** Below this scale only islands and their names matter (geographic view). */
  geoMax: 0.55,
  /** Above this scale villages and knowledge points come alive (village view). */
  villageMin: 1.8,
} as const;

/** Dev keys 1..5 fly to these scales (min zoom to max zoom). */
export const ZOOM_PRESETS = [0.12, 0.3, 0.7, 1.6, 3.2] as const;
