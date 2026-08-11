/**
 * Purpose: classic cartographic label placement — names keep one fixed size per class and
 * are instead *moved*: each name takes the first candidate anchor whose padded box clears
 * every already-placed name and obstacle, falling back to the least-overlapping candidate.
 * Main exports: labelBoxSize, placeIslandLabels, placeKingdomLabels, LabelBox, LabelBoxSize,
 * IslandLabelRequest, KingdomLabelRequest.
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
/** Gaps a name keeps from the thing it names, how far last resorts push out, seat footprint. */
const ISLAND_COAST_GAP = 20;
const ISLAND_FAR_REACH = 1.5;
const KINGDOM_ANCHOR_GAP = 16;
const KINGDOM_SEAT_BOX = 40;

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
interface PlacementItem {
  nodeId: string;
  size: LabelBoxSize;
  candidates: readonly WorldPoint[];
  priority: number;
}

/**
 * The whole heuristic: biggest feature first, first clean candidate wins, and if nothing is
 * clean the least-overlapping candidate is taken so a name is never simply dropped.
 */
function placeItems(
  items: readonly PlacementItem[],
  obstacles: readonly LabelBox[],
): Map<string, WorldPoint> {
  const taken: LabelBox[] = [...obstacles];
  const chosen = new Map<string, WorldPoint>();
  const ordered = [...items].sort((first, second) => second.priority - first.priority);
  for (const item of ordered) {
    let bestCenter: WorldPoint = item.candidates[0] ?? { x: 0, y: 0 };
    let bestOverlap = Number.POSITIVE_INFINITY;
    for (const center of item.candidates) {
      const padded: LabelBox = {
        center,
        width: item.size.width + PLACEMENT_PADDING * 2,
        height: item.size.height + PLACEMENT_PADDING * 2,
      };
      let total = 0;
      for (const other of taken) total += overlapArea(padded, other);
      if (total < bestOverlap) {
        bestOverlap = total;
        bestCenter = center;
      }
      if (total === 0) break;
    }
    chosen.set(item.nodeId, bestCenter);
    taken.push({ center: bestCenter, width: item.size.width, height: item.size.height });
  }
  return chosen;
}

export interface IslandLabelRequest {
  nodeId: string;
  content: string;
  center: WorldPoint;
  radius: number;
  letterSpacingRatio: number;
}

/** Below the coast first — then above, beside, and finally further out. */
function islandCandidates(request: IslandLabelRequest, box: LabelBoxSize): readonly WorldPoint[] {
  const { center, radius } = request;
  const vertical = radius + ISLAND_COAST_GAP + box.height / 2;
  const horizontal = radius + ISLAND_COAST_GAP + box.width / 2;
  const far = radius * ISLAND_FAR_REACH + ISLAND_COAST_GAP + box.height / 2;
  return [
    { x: center.x, y: center.y + vertical },
    { x: center.x, y: center.y - vertical },
    { x: center.x + horizontal, y: center.y },
    { x: center.x - horizontal, y: center.y },
    { x: center.x, y: center.y + far },
    { x: center.x, y: center.y - far },
  ];
}

/**
 * Island names are read at the world level, so their boxes use the world camera scale.
 * Obstacles are the compass and the sea-decor pieces already dropped into open water.
 */
export function placeIslandLabels(
  requests: readonly IslandLabelRequest[],
  screenSize: number,
  worldScale: number,
  obstacles: readonly LabelBox[],
): Map<string, WorldPoint> {
  const items = requests.map((request): PlacementItem => {
    const size = labelBoxSize(request.content, request.letterSpacingRatio, screenSize, worldScale);
    return {
      nodeId: request.nodeId,
      size,
      candidates: islandCandidates(request, size),
      priority: request.radius,
    };
  });
  return placeItems(items, obstacles);
}

export interface KingdomLabelRequest {
  nodeId: string;
  content: string;
  /** The realm's centroid — where its seat illustration stands. */
  anchor: WorldPoint;
  letterSpacingRatio: number;
  /** Bigger realms name themselves first. */
  priority: number;
}

/** The gap is measured from the seat's footprint: from its centre the name would sit on it. */
function kingdomCandidates(anchor: WorldPoint, box: LabelBoxSize): readonly WorldPoint[] {
  const reach = KINGDOM_SEAT_BOX / 2 + KINGDOM_ANCHOR_GAP;
  const vertical = reach + box.height / 2;
  const horizontal = reach + box.width / 2;
  return [
    anchor,
    { x: anchor.x, y: anchor.y - vertical },
    { x: anchor.x, y: anchor.y + vertical },
    { x: anchor.x + horizontal, y: anchor.y },
    { x: anchor.x - horizontal, y: anchor.y },
  ];
}

/**
 * Kingdom names are read at their own island's level, so their boxes use that island's
 * camera scale; every seat illustration on the island is an obstacle, the name's own
 * included — a realm's name sits beside its seat, never on it.
 */
export function placeKingdomLabels(
  requests: readonly KingdomLabelRequest[],
  screenSize: number,
  islandScale: number,
): Map<string, WorldPoint> {
  const seats: LabelBox[] = requests.map((request) => ({
    center: request.anchor,
    width: KINGDOM_SEAT_BOX,
    height: KINGDOM_SEAT_BOX,
  }));
  const items = requests.map((request): PlacementItem => {
    const size = labelBoxSize(request.content, request.letterSpacingRatio, screenSize, islandScale);
    return {
      nodeId: request.nodeId,
      size,
      candidates: kingdomCandidates(request.anchor, size),
      priority: request.priority,
    };
  });
  return placeItems(items, seats);
}
