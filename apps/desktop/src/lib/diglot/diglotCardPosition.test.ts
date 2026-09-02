/**
 * Purpose: unit tests for the pure diglot word-card placement — clamping inside the
 * scroller, viewport fallback, and the flip below the word near the viewport top.
 */
import { describe, expect, it } from "vitest";
import { computeDiglotCardPosition, FLIP_BELOW_THRESHOLD_PX } from "./diglotCardPosition";

const viewport = { width: 1280, height: 800 };
const scroller = { left: 300, right: 900 };
const cardWidth = 256;

describe("computeDiglotCardPosition", () => {
  it("opens above the word by default (bottom set, top null)", () => {
    const position = computeDiglotCardPosition({
      anchor: { left: 400, top: 500, bottom: 520 },
      scroller,
      viewport,
      cardWidth,
    });
    expect(position).toEqual({ left: 400, top: null, bottom: 800 - 500 + 4 });
  });

  it("flips below the word when the viewport top is too close", () => {
    const position = computeDiglotCardPosition({
      anchor: { left: 400, top: FLIP_BELOW_THRESHOLD_PX - 1, bottom: 240 },
      scroller,
      viewport,
      cardWidth,
    });
    expect(position.top).toBe(240 + 4);
    expect(position.bottom).toBeNull();
  });

  it("clamps the left edge inside the scroller", () => {
    const position = computeDiglotCardPosition({
      anchor: { left: 10, top: 500, bottom: 520 },
      scroller,
      viewport,
      cardWidth,
    });
    expect(position.left).toBe(scroller.left + 8);
  });

  it("clamps the right edge so the card stays inside the scroller", () => {
    const position = computeDiglotCardPosition({
      anchor: { left: 880, top: 500, bottom: 520 },
      scroller,
      viewport,
      cardWidth,
    });
    expect(position.left).toBe(scroller.right - cardWidth - 8);
  });

  it("falls back to the viewport when no scroller exists", () => {
    const position = computeDiglotCardPosition({
      anchor: { left: 1270, top: 500, bottom: 520 },
      scroller: null,
      viewport,
      cardWidth,
    });
    expect(position.left).toBe(viewport.width - cardWidth - 8);
  });

  it("never clamps left of the minimum when the scroller is narrower than the card", () => {
    const position = computeDiglotCardPosition({
      anchor: { left: 150, top: 500, bottom: 520 },
      scroller: { left: 100, right: 200 },
      viewport,
      cardWidth,
    });
    expect(position.left).toBe(108);
  });
});
