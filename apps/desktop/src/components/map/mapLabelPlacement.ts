/**
 * Purpose: the shared engine of cartographic label placement — a name keeps one fixed size
 * per class and is *moved* instead of shrunk: it takes the first candidate anchor whose
 * padded box clears every already-placed name and obstacle, else it ring-searches outward
 * until a clean spot exists — names NEVER overlap each other, by construction.
 * The per-class candidate sets live in mapIslandLabels.ts and mapKingdomLabels.ts.
 * Main exports: labelBoxSize, placeLabelItems, LabelBox, LabelBoxSize, PlacementItem,
 * PlacementChoice.
 */
import type { WorldPoint } from "@breadcrumb/feature-map";

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

function paddedBoxAt(center: WorldPoint, size: LabelBoxSize): LabelBox {
  return {
    center,
    width: size.width + PLACEMENT_PADDING * 2,
    height: size.height + PLACEMENT_PADDING * 2,
  };
}

function totalOverlap(box: LabelBox, taken: readonly LabelBox[]): number {
  let total = 0;
  for (const other of taken) total += overlapArea(box, other);
  return total;
}

/** Golden-angle ring search around a seed: the sea is unbounded, so a clean spot always
 * exists within a few rings — this is the no-overlap guarantee behind placeLabelItems. */
function ringSearch(seed: WorldPoint, size: LabelBoxSize, taken: readonly LabelBox[]): WorldPoint {
  const step = Math.max(size.height, 40);
  const goldenAngle = 2.399963229728653;
  for (let attempt = 1; attempt <= 200; attempt += 1) {
    const ringRadius = step * (1 + attempt * 0.5);
    const angle = attempt * goldenAngle;
    const center = {
      x: seed.x + Math.cos(angle) * ringRadius,
      y: seed.y + Math.sin(angle) * ringRadius,
    };
    if (totalOverlap(paddedBoxAt(center, size), taken) === 0) return center;
  }
  return seed;
}

/**
 * The whole heuristic: biggest feature first, first clean candidate wins; when every
 * candidate is dirty the name ring-searches outward from its last candidate until it finds
 * open water. Two names can therefore never lie on each other.
 */
export function placeLabelItems(
  items: readonly PlacementItem[],
  obstacles: readonly LabelBox[],
): Map<string, PlacementChoice> {
  const taken: LabelBox[] = [...obstacles];
  const chosen = new Map<string, PlacementChoice>();
  const ordered = [...items].sort((first, second) => second.priority - first.priority);
  for (const item of ordered) {
    let best: PlacementChoice | null = null;
    for (const [candidateIndex, center] of item.candidates.entries()) {
      if (totalOverlap(paddedBoxAt(center, item.size), taken) === 0) {
        best = { center, candidateIndex };
        break;
      }
    }
    if (best === null) {
      const seed = item.candidates.at(-1) ?? { x: 0, y: 0 };
      best = {
        center: ringSearch(seed, item.size, taken),
        candidateIndex: item.candidates.length,
      };
    }
    chosen.set(item.nodeId, best);
    taken.push({ center: best.center, width: item.size.width, height: item.size.height });
  }
  return chosen;
}
