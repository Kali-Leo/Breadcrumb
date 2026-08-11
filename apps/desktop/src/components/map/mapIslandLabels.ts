/**
 * Purpose: where an island's name sits (spec 031 §4) — it wants to lie ON its own island,
 * dead centre or nudged along its body, and overlapping that terrain is legal since only
 * other names and sea decor are dodged. Going to sea is the last resort, and the returned
 * `outside` flag says so, so the scene can pin the name back with a leader line.
 * Main exports: placeIslandLabels, IslandLabelRequest, IslandLabelPlacement.
 */
import type { WorldPoint } from "@breadcrumb/plugin-map";
import {
  type LabelBox,
  type LabelBoxSize,
  labelBoxSize,
  type PlacementItem,
  placeLabelItems,
} from "./mapLabelPlacement";

/** Gap a name keeps from the coast once it has given up and sailed, and how far the very
 * last resorts push out. */
const ISLAND_COAST_GAP = 20;
const ISLAND_FAR_REACH = 1.5;
/** How far a name may slide up or down the island's own body before it gives up and sails.
 * Both stay inside the disc, so the name still reads as belonging to that land. */
const ISLAND_ONSHORE_NUDGES = [0.35, 0.7] as const;

export interface IslandLabelRequest {
  nodeId: string;
  content: string;
  center: WorldPoint;
  radius: number;
  letterSpacingRatio: number;
}

export interface IslandLabelPlacement {
  center: WorldPoint;
  /** True when the name had to leave its own land — the scene then draws a leader line. */
  outside: boolean;
}

/**
 * On its own island first: dead centre, then nudged up and down along the island's body,
 * all still well inside the coast. Only when every one of those is taken does the name go
 * to sea — below, above, beside, and finally further out.
 */
function islandCandidates(request: IslandLabelRequest, box: LabelBoxSize): readonly WorldPoint[] {
  const { center, radius } = request;
  const vertical = radius + ISLAND_COAST_GAP + box.height / 2;
  const horizontal = radius + ISLAND_COAST_GAP + box.width / 2;
  const far = radius * ISLAND_FAR_REACH + ISLAND_COAST_GAP + box.height / 2;
  const onshore = ISLAND_ONSHORE_NUDGES.flatMap((fraction) => [
    { x: center.x, y: center.y - radius * fraction },
    { x: center.x, y: center.y + radius * fraction },
  ]);
  return [
    { x: center.x, y: center.y },
    ...onshore,
    { x: center.x, y: center.y + vertical },
    { x: center.x, y: center.y - vertical },
    { x: center.x + horizontal, y: center.y },
    { x: center.x - horizontal, y: center.y },
    { x: center.x, y: center.y + far },
    { x: center.x, y: center.y - far },
  ];
}

/** Everything before this index lies on the island itself. */
const ISLAND_ONSHORE_CANDIDATES = 1 + ISLAND_ONSHORE_NUDGES.length * 2;

/**
 * Island names are read at the world level, so their boxes use the world camera scale.
 * The island a name belongs to is never an obstacle — a name lying across its own terrain is
 * the point. Obstacles are the compass and the sea-decor pieces already dropped into water.
 */
export function placeIslandLabels(
  requests: readonly IslandLabelRequest[],
  screenSize: number,
  worldScale: number,
  obstacles: readonly LabelBox[],
): Map<string, IslandLabelPlacement> {
  const items = requests.map((request): PlacementItem => {
    const size = labelBoxSize(request.content, request.letterSpacingRatio, screenSize, worldScale);
    return {
      nodeId: request.nodeId,
      size,
      candidates: islandCandidates(request, size),
      priority: request.radius,
    };
  });
  const chosen = placeLabelItems(items, obstacles);
  return new Map(
    [...chosen].map(([nodeId, choice]) => [
      nodeId,
      { center: choice.center, outside: choice.candidateIndex >= ISLAND_ONSHORE_CANDIDATES },
    ]),
  );
}
