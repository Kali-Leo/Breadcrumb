/**
 * Purpose: the map's visual language, replicated from Nortantis official sample #3
 * "The Land of Laham" — ivory sea, uniform sepia land, dark-brown ink, framed border.
 * Every color is a copy of that official style; the label sizes are ours.
 * Main exports: mapTheme.
 */

export const mapTheme = {
  /** Laham ivory sea. */
  parchment: 0xe9e2cf,
  /** Laham sepia land. */
  landFill: 0xd8ccae,
  /** Laham dark-brown ink (coasts, labels, marks). */
  ink: 0x3a3226,
  /** Laham secondary ink for soft shading. */
  inkSoft: 0x77684f,
  /** Rivers are thin ink lines in Laham — never blue. */
  river: 0x4a3f2f,
  fog: 0xfaf6ec,
  fontFamily: '"LXGW WenKai", Georgia, "Noto Serif CJK SC", "Songti SC", serif',
  /** On-screen px range each name may render in; the exact size is fitted to its place. */
  labelSizes: {
    island: { min: 14, max: 34 },
    kingdom: { min: 12, max: 24 },
  },
} as const;
