/**
 * Purpose: which screen the palace owes the learner. The rule is trivial; what matters is that
 * it is a rule and not an early `return`, because an early return unmounts the Pixi container
 * and useMapApplication's init effect runs exactly once (bug hunt 2026-09-03 — a new learner's
 * empty sea killed the map for the whole session, first island or not). The container is
 * rendered unconditionally and this decides what covers it, which the headless walkthrough
 * checks on the real page.
 */
import { describe, expect, it } from "vitest";
import { mapOverlayState } from "./MapStateOverlay";

describe("mapOverlayState", () => {
  it("says nothing when there is a map to look at", () => {
    expect(mapOverlayState({ initFailed: false, islandCount: 3 })).toBeNull();
  });

  it("calls an island-less world open sea", () => {
    expect(mapOverlayState({ initFailed: false, islandCount: 0 })).toBe("emptySea");
  });

  it("puts a failed renderer ahead of an empty sea — the sea count means nothing then", () => {
    expect(mapOverlayState({ initFailed: true, islandCount: 0 })).toBe("loadFailed");
    expect(mapOverlayState({ initFailed: true, islandCount: 9 })).toBe("loadFailed");
  });
});
