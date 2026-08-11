/**
 * Purpose: the shared engine of cartographic label placement — a name keeps one fixed size
 * per class and is *moved* instead of shrunk: it takes the first candidate anchor whose
 * padded box clears every already-placed name and obstacle, else the least-overlapping one.
 * The per-class candidate sets live in mapIslandLabels.ts and mapKingdomLabels.ts.
 * Main exports: labelBoxSize, placeLabelItems, LabelBox, LabelBoxSize, PlacementItem,
 * PlacementChoice.
 */
import type { WorldPoint } from "@breadcrumb/plugin-map";

/** An axis-aligned box in world units. */
export interface LabelBox {
  center: WorldPoint;
  width: number;
  height: number;
}

export interface LabelBoxSize {
  width: number;
  height: number;
}

/** Breathing room every name keeps from its neighbours, and its line height (world units). */
const PLACEMENT_PADDING = 8;
const LINE_HEIGHT_RATIO = 1.25;

/**
 * A name's world-unit footprint: its fixed screen size divided by the camera scale of the
 * level where the name is read. Width estimate: full-width CJK counts as one em-ish unit,
 * latin/digits/punctuation as 0.55, times the 0.62 average glyph width of the handwriting
 * face, plus letter spacing.
 */
export function labelBoxSize(
  content: string,
  letterSpacingRatio: number,
  screenSize: number,
  referenceScale: number,
): LabelBoxSize {
  const characters = [...content];
  const units = characters.reduce(
    (sum, character) => sum + ((character.codePointAt(0) ?? 0) > 0x2e80 ? 1 : 0.55),
    0,
  );
  const widthPerFontSize = Math.max(0.62 * units + letterSpacingRatio * characters.length, 0.1);
  const worldFontSize = screenSize / Math.max(referenceScale, 1e-6);
  return { width: widthPerFontSize * worldFontSize, height: worldFontSize * LINE_HEIGHT_RATIO };
}

function overlapArea(first: LabelBox, second: LabelBox): number {
  const overlapX =
    Math.min(first.center.x + first.width / 2, second.center.x + second.width / 2) -
    Math.max(first.center.x - first.width / 2, second.center.x - second.width / 2);
  const overlapY =
    Math.min(first.center.y + first.height / 2, second.center.y + second.height / 2) -
    Math.max(first.center.y - first.height / 2, second.center.y - second.height / 2);
  return overlapX <= 0 || overlapY <= 0 ? 0 : overlapX * overlapY;
}

/** Candidates are tried best-first; the biggest priority is placed first and so keeps its. */
export interface PlacementItem {
  nodeId: string;
  size: LabelBoxSize;
  candidates: readonly WorldPoint[];
  priority: number;
}

/** Which candidate a name ended up on — the index tells the caller how far it had to go. */
export interface PlacementChoice {
  center: WorldPoint;
  candidateIndex: number;
}

/**
 * The whole heuristic: biggest feature first, first clean candidate wins, and if nothing is
 * clean the least-overlapping candidate is taken so a name is never simply dropped.
 */
export function placeLabelItems(
  items: readonly PlacementItem[],
  obstacles: readonly LabelBox[],
): Map<string, PlacementChoice> {
  const taken: LabelBox[] = [...obstacles];
  const chosen = new Map<string, PlacementChoice>();
  const ordered = [...items].sort((first, second) => second.priority - first.priority);
  for (const item of ordered) {
    let best: PlacementChoice = { center: item.candidates[0] ?? { x: 0, y: 0 }, candidateIndex: 0 };
    let bestOverlap = Number.POSITIVE_INFINITY;
    for (const [candidateIndex, center] of item.candidates.entries()) {
      const padded: LabelBox = {
        center,
        width: item.size.width + PLACEMENT_PADDING * 2,
        height: item.size.height + PLACEMENT_PADDING * 2,
      };
      let total = 0;
      for (const other of taken) total += overlapArea(padded, other);
      if (total < bestOverlap) {
        bestOverlap = total;
        best = { center, candidateIndex };
      }
      if (total === 0) break;
    }
    chosen.set(item.nodeId, best);
    taken.push({ center: best.center, width: item.size.width, height: item.size.height });
  }
  return chosen;
}
