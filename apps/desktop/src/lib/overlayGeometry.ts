/**
 * Purpose: small pure SVG-geometry helpers for GoalOverlayView (spec 017 #2) — shortening an
 * edge segment so its arrowhead lands at a box's edge instead of its center, and truncating a
 * node label so it fits inside a fixed-width box. No DOM here.
 * Main exports: shortenSegment, truncateLabel.
 */

export interface Point {
  x: number;
  y: number;
}

/** Moves `from` and `to` toward each other by `fromRadius`/`toRadius` along their connecting
 * line, so an edge drawn between the results stops at each node's approximate box edge
 * (treated as a circle of that radius) rather than overlapping its center. Returns the
 * original points unchanged if they coincide (nothing to shorten along). */
export function shortenSegment(
  from: Point,
  to: Point,
  fromRadius: number,
  toRadius: number,
): { from: Point; to: Point } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { from, to };

  const unitX = dx / distance;
  const unitY = dy / distance;
  return {
    from: { x: from.x + unitX * fromRadius, y: from.y + unitY * fromRadius },
    to: { x: to.x - unitX * toRadius, y: to.y - unitY * toRadius },
  };
}

/** Truncates a label to at most maxChars characters (CJK-safe: counts code points, not bytes),
 * appending an ellipsis when it doesn't fit whole. */
export function truncateLabel(label: string, maxChars: number): string {
  const chars = [...label];
  if (chars.length <= maxChars) return label;
  return `${chars.slice(0, maxChars).join("")}…`;
}
