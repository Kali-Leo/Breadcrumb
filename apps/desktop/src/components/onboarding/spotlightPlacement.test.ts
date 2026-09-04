/**
 * Purpose: the tour card's side has to follow the reading direction, not a hardcoded edge.
 * `start`/`end` were logical names implemented physically — `end` always meant "to the
 * right" — so in Arabic every step that wanted the card *after* its target put it in front
 * of the target instead, on the far side of the screen from the thing it was pointing at.
 *
 * No DOM library: the two globals this module reads are stubbed directly, which also pins
 * down exactly how little of the DOM the placement math is allowed to depend on.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cardPosition, isRightToLeft, type SpotlightRect } from "./spotlightPlacement";

const VIEWPORT = { innerWidth: 1200, innerHeight: 800 };
const CARD = { width: 320, height: 220 };
/** A sidebar-ish target near the left edge, with room for the card on either side. */
const TARGET: SpotlightRect = { top: 100, left: 360, width: 240, height: 300 };

function useDocumentDirection(dir: "ltr" | "rtl"): void {
  const attributes = new Map<string, string>([["dir", dir]]);
  Object.assign(globalThis, {
    window: VIEWPORT,
    document: {
      documentElement: {
        dir,
        getAttribute: (name: string) => attributes.get(name) ?? null,
      },
    },
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
});

/** The card's left edge, as a number — every branch under test returns one. */
function leftOf(place: "start" | "end"): number {
  const style = cardPosition(TARGET, place, CARD);
  expect(typeof style.left, `${place} did not resolve to a numeric left`).toBe("number");
  return style.left as number;
}

describe("which side of the target the tour card takes", () => {
  it("reads the direction off the live document", () => {
    useDocumentDirection("rtl");
    expect(isRightToLeft()).toBe(true);
    useDocumentDirection("ltr");
    expect(isRightToLeft()).toBe(false);
  });

  it("treats a document with no dir at all as left-to-right", () => {
    expect(isRightToLeft()).toBe(false);
  });

  it("puts `end` after the target and `start` before it when reading left to right", () => {
    useDocumentDirection("ltr");
    expect(leftOf("end")).toBeGreaterThan(TARGET.left + TARGET.width);
    expect(leftOf("start")).toBeLessThan(TARGET.left);
  });

  it("mirrors both sides when reading right to left", () => {
    useDocumentDirection("rtl");
    // `end` is still "after the target in reading order" — which in Arabic is to its left.
    expect(leftOf("end")).toBeLessThan(TARGET.left);
    expect(leftOf("start")).toBeGreaterThan(TARGET.left + TARGET.width);
  });

  it("falls back to below the target when the mirrored side has no room", () => {
    useDocumentDirection("rtl");
    // Hard against the left edge: `end` would want the left side, and there is none.
    const cornered: SpotlightRect = { top: 40, left: 0, width: 200, height: 100 };
    const style = cardPosition(cornered, "end", CARD);
    expect(style.top).toBe(cornered.top + cornered.height + 14);
  });
});
