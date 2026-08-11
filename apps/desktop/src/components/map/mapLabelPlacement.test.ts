/**
 * Purpose: pure-geometry checks on cartographic label placement — names that would collide
 * at their preferred anchor must end up disjoint, and the result must be deterministic.
 * Main exports: none (vitest suite).
 */
import type { WorldPoint } from "@breadcrumb/plugin-map";
import { describe, expect, it } from "vitest";
import {
  type IslandLabelRequest,
  type KingdomLabelRequest,
  type LabelBox,
  labelBoxSize,
  placeIslandLabels,
  placeKingdomLabels,
} from "./mapLabelPlacement";

const ISLAND_NAME = "记忆的岛屿";
const ISLAND_SIZE = 26;
const ISLAND_SPACING = 0.2;
const KINGDOM_NAME = "王国";
const KINGDOM_SIZE = 19;
const KINGDOM_SPACING = 0.18;
/** Reference scale 1 keeps world units and screen px identical, so the maths stays readable. */
const SCALE = 1;

function overlapArea(first: LabelBox, second: LabelBox): number {
  const overlapX =
    Math.min(first.center.x + first.width / 2, second.center.x + second.width / 2) -
    Math.max(first.center.x - first.width / 2, second.center.x - second.width / 2);
  const overlapY =
    Math.min(first.center.y + first.height / 2, second.center.y + second.height / 2) -
    Math.max(first.center.y - first.height / 2, second.center.y - second.height / 2);
  return overlapX <= 0 || overlapY <= 0 ? 0 : overlapX * overlapY;
}

function islandBox(center: WorldPoint): LabelBox {
  return { center, ...labelBoxSize(ISLAND_NAME, ISLAND_SPACING, ISLAND_SIZE, SCALE) };
}

function kingdomBox(center: WorldPoint): LabelBox {
  return { center, ...labelBoxSize(KINGDOM_NAME, KINGDOM_SPACING, KINGDOM_SIZE, SCALE) };
}

function islandRequest(nodeId: string, center: WorldPoint, radius: number): IslandLabelRequest {
  return { nodeId, content: ISLAND_NAME, center, radius, letterSpacingRatio: ISLAND_SPACING };
}

/** Where an island name lands when nothing is in its way: centred just under the coast. */
function preferredCenter(request: IslandLabelRequest): WorldPoint {
  const box = labelBoxSize(ISLAND_NAME, ISLAND_SPACING, ISLAND_SIZE, SCALE);
  return { x: request.center.x, y: request.center.y + request.radius + 20 + box.height / 2 };
}

describe("placeIslandLabels", () => {
  const bigger = islandRequest("big", { x: 0, y: 0 }, 120);
  const smaller = islandRequest("small", { x: 60, y: 0 }, 100);

  it("keeps two names that want the same strip of sea disjoint", () => {
    const wouldClash = overlapArea(
      islandBox(preferredCenter(bigger)),
      islandBox(preferredCenter(smaller)),
    );
    expect(wouldClash).toBeGreaterThan(0);

    const placed = placeIslandLabels([bigger, smaller], ISLAND_SIZE, SCALE, []);
    const bigBox = islandBox(placed.get("big") ?? bigger.center);
    const smallBox = islandBox(placed.get("small") ?? smaller.center);
    expect(overlapArea(bigBox, smallBox)).toBe(0);
  });

  it("lets the bigger island keep the anchor and moves the smaller one", () => {
    // Input order is deliberately the reverse of the placement order.
    const placed = placeIslandLabels([smaller, bigger], ISLAND_SIZE, SCALE, []);
    expect(placed.get("big")).toEqual(preferredCenter(bigger));
    expect(placed.get("small")).not.toEqual(preferredCenter(smaller));
  });

  it("moves a name off an anchor a sea decoration already occupies", () => {
    const decoration: LabelBox = { center: preferredCenter(bigger), width: 300, height: 120 };
    const placed = placeIslandLabels([bigger], ISLAND_SIZE, SCALE, [decoration]);
    const chosen = placed.get("big") ?? bigger.center;
    expect(chosen.y).toBeLessThan(0);
    expect(overlapArea(islandBox(chosen), decoration)).toBe(0);
  });

  it("returns the same placement for the same input", () => {
    const first = placeIslandLabels([bigger, smaller], ISLAND_SIZE, SCALE, []);
    const second = placeIslandLabels([bigger, smaller], ISLAND_SIZE, SCALE, []);
    expect([...second]).toEqual([...first]);
  });
});

describe("placeKingdomLabels", () => {
  function kingdomRequest(
    nodeId: string,
    anchor: WorldPoint,
    priority: number,
  ): KingdomLabelRequest {
    return { nodeId, content: KINGDOM_NAME, anchor, letterSpacingRatio: KINGDOM_SPACING, priority };
  }

  it("sets every realm name clear of every seat and of each other", () => {
    // Two seats close enough that the second realm cannot use its preferred anchor either.
    const requests = [
      kingdomRequest("first", { x: 0, y: 0 }, 10),
      kingdomRequest("second", { x: 0, y: -10 }, 5),
    ];
    const placed = placeKingdomLabels(requests, KINGDOM_SIZE, SCALE);
    const boxes = requests.map((request) =>
      kingdomBox(placed.get(request.nodeId) ?? request.anchor),
    );
    const seats: LabelBox[] = requests.map((request) => ({
      center: request.anchor,
      width: 40,
      height: 40,
    }));
    for (const box of boxes) {
      for (const seat of seats) expect(overlapArea(box, seat)).toBe(0);
    }
    expect(overlapArea(boxes[0], boxes[1])).toBe(0);
  });
});
