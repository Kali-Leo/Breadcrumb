/**
 * Purpose: where a realm's name sits — beside the seat illustration it belongs to, never on
 * it and never on another realm's name.
 * Main exports: placeKingdomLabels, KingdomLabelRequest.
 */
import type { WorldPoint } from "@breadcrumb/plugin-map";
import {
  type LabelBox,
  type LabelBoxSize,
  labelBoxSize,
  type PlacementItem,
  placeLabelItems,
} from "./mapLabelPlacement";

/** The seat's own footprint, and the gap a name keeps from its edge. */
const KINGDOM_ANCHOR_GAP = 16;
const KINGDOM_SEAT_BOX = 40;

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
  return new Map(
    [...placeLabelItems(items, seats)].map(([nodeId, choice]) => [nodeId, choice.center]),
  );
}
