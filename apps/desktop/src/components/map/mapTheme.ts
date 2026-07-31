/**
 * Purpose: the map's visual language, replicated from Nortantis official sample #3
 * "The Land of Laham" — ivory sea, uniform sepia land, dark-brown ink, framed border.
 * Every value is a copy of that official style; no invented colors.
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
  labelSizes: { island: 30, kingdom: 17, village: 12, point: 9 },
} as const;
