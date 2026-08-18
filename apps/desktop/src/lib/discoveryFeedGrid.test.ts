/**
 * Purpose: the grid arithmetic at the window widths that matter (spec 054 §(b)). The numbers here
 * are the answer to "what does a card actually look like on this monitor" — the question the old
 * `grid-cols-1 / sm:2 / xl:3` ladder got wrong, drawing three cards about 613px wide on a 1920px
 * window because it stopped adding columns at 1280px.
 *
 * Content width, not window width: the app's sidebar is 240px and the feed pads itself 24px on
 * each side, so a card grid on a 1280px window is laid out in 992px.
 */
import { describe, expect, it } from "vitest";
import {
  FEED_GRID_GAP_PX,
  FEED_GRID_MAX_CONTENT_PX,
  FEED_GRID_MINIMUM_CARD_PX,
  FEED_GRID_TEMPLATE_COLUMNS,
  feedGridCardWidthPx,
  feedGridColumnCount,
} from "./discoveryFeedGrid";

const SIDEBAR_AND_PADDING_PX = 240 + 24 * 2;

function contentWidthAt(windowWidthPx: number): number {
  return windowWidthPx - SIDEBAR_AND_PADDING_PX;
}

describe("the feed grid's CSS", () => {
  it("fills as many 320px-or-wider columns as fit", () => {
    expect(FEED_GRID_TEMPLATE_COLUMNS).toBe("repeat(auto-fill, minmax(320px, 1fr))");
  });

  /** auto-fit collapses the tracks no card landed in and stretches the last row across the space
   * it freed, which would draw one enormous card whenever a batch ends on an odd number. */
  it("never uses auto-fit", () => {
    expect(FEED_GRID_TEMPLATE_COLUMNS).not.toContain("auto-fit");
  });

  it("uses bilibili's measured 20px gap and stops widening at 1680px", () => {
    expect(FEED_GRID_GAP_PX).toBe(20);
    expect(FEED_GRID_MAX_CONTENT_PX).toBe(1680);
    expect(FEED_GRID_MINIMUM_CARD_PX).toBe(320);
  });
});

describe("columns and card width by window width", () => {
  const cases = [
    { window: 1024, columns: 2, cardWidth: 358 },
    { window: 1280, columns: 2, cardWidth: 486 },
    { window: 1440, columns: 3, cardWidth: 370.66 },
    { window: 1680, columns: 4, cardWidth: 333 },
    { window: 1920, columns: 4, cardWidth: 393 },
    { window: 2560, columns: 5, cardWidth: 320 },
  ];

  for (const one of cases) {
    it(`draws ${one.columns} columns of about ${Math.round(one.cardWidth)}px at ${one.window}px`, () => {
      const width = contentWidthAt(one.window);
      expect(feedGridColumnCount(width)).toBe(one.columns);
      expect(feedGridCardWidthPx(width)).toBeCloseTo(one.cardWidth, 0);
    });
  }

  /** The whole point of the cap: past 1680px of content the cards stop growing. A 2560px and a
   * 3840px monitor draw the same grid. */
  it("draws the same grid on any monitor wider than the cap", () => {
    expect(feedGridCardWidthPx(contentWidthAt(2560))).toBe(
      feedGridCardWidthPx(contentWidthAt(3840)),
    );
  });

  /** A card is never narrower than the minimum, whatever the width — that is what minmax promises,
   * and it is what stops the grid from packing in columns nobody can read. */
  it("never draws a card narrower than the minimum", () => {
    for (let width = 320; width <= 2000; width += 7) {
      expect(feedGridCardWidthPx(width)).toBeGreaterThanOrEqual(FEED_GRID_MINIMUM_CARD_PX);
    }
  });

  it("keeps one column on a window too narrow for two", () => {
    expect(feedGridColumnCount(300)).toBe(1);
    expect(feedGridColumnCount(0)).toBe(1);
  });
});
