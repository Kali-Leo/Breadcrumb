/**
 * Purpose: the bubble's side has to follow the reading direction, not a hardcoded edge, and
 * the arrow has to land on the element whichever side the bubble ended up on.
 *
 * No DOM library: the two globals this module reads are stubbed directly, which also pins
 * down exactly how little of the DOM the placement math is allowed to depend on.
 */
import { afterEach, describe, expect, it } from "vitest";
import { type AnchorRect, bubbleLayout, isRightToLeft } from "./hintPlacement";

const VIEWPORT = { innerWidth: 1200, innerHeight: 800 };
const BUBBLE = { width: 260, height: 60 };
/** A sidebar-icon-ish target with room for the bubble on every side. */
const TARGET: AnchorRect = { top: 700, left: 100, width: 40, height: 40 };

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

describe("which side of the element the bubble takes", () => {
  it("reads the direction off the live document", () => {
    useDocumentDirection("rtl");
    expect(isRightToLeft()).toBe(true);
    useDocumentDirection("ltr");
    expect(isRightToLeft()).toBe(false);
  });

  it("treats a document with no dir at all as left-to-right", () => {
    expect(isRightToLeft()).toBe(false);
  });

  it("puts `end` after the element and `start` before it when reading left to right", () => {
    useDocumentDirection("ltr");
    const after = bubbleLayout(TARGET, "end", BUBBLE);
    expect(after.side).toBe("right");
    expect(after.left).toBeGreaterThan(TARGET.left + TARGET.width);
    const wide: AnchorRect = { ...TARGET, left: 600 };
    expect(bubbleLayout(wide, "start", BUBBLE).left).toBeLessThan(wide.left);
  });

  it("mirrors both sides when reading right to left", () => {
    useDocumentDirection("rtl");
    const wide: AnchorRect = { ...TARGET, left: 600 };
    // `end` is still "after the element in reading order" — which in Arabic is to its left.
    expect(bubbleLayout(wide, "end", BUBBLE).side).toBe("left");
    expect(bubbleLayout(wide, "start", BUBBLE).side).toBe("right");
  });

  it("falls back above the element when the mirrored side has no room", () => {
    useDocumentDirection("rtl");
    // Hard against the left edge: `end` would want the left side, and there is none.
    const layout = bubbleLayout(TARGET, "end", BUBBLE);
    expect(layout.side).toBe("top");
    expect(layout.top).toBe(TARGET.top - 10 - BUBBLE.height);
  });

  it("keeps the arrow on the element's centre after the bubble is pushed on screen", () => {
    useDocumentDirection("ltr");
    // At the very left: the bubble cannot centre on the element, so the arrow moves instead.
    const cornered: AnchorRect = { top: 400, left: 0, width: 30, height: 30 };
    const layout = bubbleLayout(cornered, "top", BUBBLE);
    expect(layout.left).toBe(12);
    expect(layout.arrow).toBe(14);
  });

  it("sits inside the lower edge of an element that fills the screen", () => {
    useDocumentDirection("ltr");
    const huge: AnchorRect = { top: 0, left: 0, width: 1200, height: 800 };
    const layout = bubbleLayout(huge, "top", BUBBLE);
    expect(layout.side).toBe("bottom");
    expect(layout.top + BUBBLE.height).toBeLessThanOrEqual(VIEWPORT.innerHeight);
  });
});
