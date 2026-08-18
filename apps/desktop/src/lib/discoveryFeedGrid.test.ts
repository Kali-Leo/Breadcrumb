/**
 * Purpose: the grid arithmetic at the window widths that matter, for each of the three card sizes
 * (spec 054 §(b)). The numbers here are the answer to "what does a card actually look like on this
 * monitor" — the question the old fixed 320px minimum got wrong at the size the app opens at,
 * drawing two 486px cards on a 1280px window because 992px of content misses three 320px tracks by
 * eight pixels («卡片太大了», Leo 2026-08-18).
 *
 * Content width, not window width: the app's sidebar is 240px and the feed pads itself 24px on
 * each side, so a card grid on a 1280px window is laid out in 992px.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISCOVERY_CARD_SIZE,
  DISCOVERY_CARD_SIZES,
  type DiscoveryCardSize,
  FEED_GRID_GAP_PX,
  FEED_GRID_MAX_CONTENT_PX,
  FEED_GRID_MAXIMUM_CARD_PX,
  FEED_GRID_MINIMUM_CARD_PX_BY_SIZE,
  feedGridCardWidthPx,
  feedGridColumnCount,
  feedGridTemplateColumns,
  isDiscoveryCardSize,
} from "./discoveryFeedGrid";

const SIDEBAR_AND_PADDING_PX = 240 + 24 * 2;

function contentWidthAt(windowWidthPx: number): number {
  return windowWidthPx - SIDEBAR_AND_PADDING_PX;
}

/** window → [columns, card width] for each size. Every number is the browser's own arithmetic for
 * `repeat(auto-fill, minmax(N, 1fr))` at that content width. */
const TABLE: Readonly<Record<DiscoveryCardSize, readonly (readonly [number, number, number])[]>> = {
  small: [
    [1024, 3, 232],
    [1280, 4, 233],
    [1440, 4, 273],
    [1680, 5, 262.4],
    [1920, 6, 255.33],
    [2560, 6, 263.33],
  ],
  medium: [
    [1024, 2, 358],
    [1280, 3, 317.33],
    [1440, 3, 370.67],
    [1680, 4, 333],
    [1920, 5, 310.4],
    [2560, 5, 320],
  ],
  large: [
    [1024, 2, 358],
    [1280, 2, 486],
    [1440, 3, 370.67],
    [1680, 3, 450.67],
    [1920, 4, 393],
    [2560, 4, 405],
  ],
};

describe("the feed grid's CSS", () => {
  it("fills as many columns as fit at the chosen minimum", () => {
    expect(feedGridTemplateColumns("small")).toBe("repeat(auto-fill, minmax(230px, 1fr))");
    expect(feedGridTemplateColumns("medium")).toBe("repeat(auto-fill, minmax(300px, 1fr))");
    expect(feedGridTemplateColumns("large")).toBe("repeat(auto-fill, minmax(340px, 1fr))");
  });

  /** auto-fit collapses the tracks no card landed in and stretches the last row across the space
   * it freed, which would draw one enormous card whenever a batch ends on an odd number. */
  it("never uses auto-fit", () => {
    for (const size of DISCOVERY_CARD_SIZES) {
      expect(feedGridTemplateColumns(size)).not.toContain("auto-fit");
    }
  });

  it("keeps bilibili's measured 20px gap and stops widening at 1680px", () => {
    expect(FEED_GRID_GAP_PX).toBe(20);
    expect(FEED_GRID_MAX_CONTENT_PX).toBe(1680);
    expect(FEED_GRID_MAXIMUM_CARD_PX).toBe(500);
  });

  it("starts everyone at the middle step", () => {
    expect(DEFAULT_DISCOVERY_CARD_SIZE).toBe("medium");
    expect(DISCOVERY_CARD_SIZES).toEqual(["small", "medium", "large"]);
  });

  it("recognises only the three sizes it knows", () => {
    expect(isDiscoveryCardSize("medium")).toBe(true);
    expect(isDiscoveryCardSize("huge")).toBe(false);
    expect(isDiscoveryCardSize(null)).toBe(false);
  });
});

describe("columns and card width by window width", () => {
  for (const size of DISCOVERY_CARD_SIZES) {
    for (const [windowWidth, columns, cardWidth] of TABLE[size]) {
      it(`${size}: ${columns} columns of about ${Math.round(cardWidth)}px at ${windowWidth}px`, () => {
        const width = contentWidthAt(windowWidth);
        expect(feedGridColumnCount(width, size)).toBe(columns);
        expect(feedGridCardWidthPx(width, size)).toBeCloseTo(cardWidth, 1);
      });
    }
  }

  /** The window the app opens at, and the one Leo was looking at when he called the cards too big.
   * Three columns is the whole point of the 300px minimum. */
  it("draws three columns at the size the app opens at", () => {
    expect(feedGridColumnCount(contentWidthAt(1280), DEFAULT_DISCOVERY_CARD_SIZE)).toBe(3);
  });

  it("still draws at least two columns on a small laptop at every size", () => {
    for (const size of DISCOVERY_CARD_SIZES) {
      expect(feedGridColumnCount(contentWidthAt(1024), size)).toBeGreaterThanOrEqual(2);
    }
  });

  /** The default has to be right without anyone touching it: no window from a small laptop up
   * draws a card wider than this, so nobody has to reach for the switch to make it usable. */
  it("never draws a card wider than 460px at the middle step, on any window", () => {
    for (let windowWidth = 1024; windowWidth <= 3840; windowWidth += 1) {
      expect(feedGridCardWidthPx(contentWidthAt(windowWidth), "medium")).toBeLessThanOrEqual(460);
    }
  });

  /** Even the largest step on the narrowest window: the card's own max-width holds the line. */
  it("never draws a card wider than the ceiling at any size or width", () => {
    for (const size of DISCOVERY_CARD_SIZES) {
      for (let width = 200; width <= 4000; width += 3) {
        expect(feedGridCardWidthPx(width, size)).toBeLessThanOrEqual(FEED_GRID_MAXIMUM_CARD_PX);
      }
    }
  });

  /** The whole point of the cap: past 1680px of content the cards stop growing. A 2560px and a
   * 3840px monitor draw the same grid. */
  it("draws the same grid on any monitor wider than the cap", () => {
    for (const size of DISCOVERY_CARD_SIZES) {
      expect(feedGridCardWidthPx(contentWidthAt(2560), size)).toBe(
        feedGridCardWidthPx(contentWidthAt(3840), size),
      );
    }
  });

  /** A card is never narrower than the step's minimum, whatever the width — that is what minmax
   * promises, and it is what stops the grid from packing in columns nobody can read. */
  it("never draws a card narrower than the step's minimum", () => {
    for (const size of DISCOVERY_CARD_SIZES) {
      const minimum = FEED_GRID_MINIMUM_CARD_PX_BY_SIZE[size];
      for (let width = minimum; width <= 2000; width += 7) {
        expect(feedGridCardWidthPx(width, size)).toBeGreaterThanOrEqual(minimum);
      }
    }
  });

  it("keeps one column on a window too narrow for two", () => {
    expect(feedGridColumnCount(300, "medium")).toBe(1);
    expect(feedGridColumnCount(0, "medium")).toBe(1);
  });

  /** Each step really is a step: at the window the app opens at, and at a common large monitor,
   * moving the switch changes what the reader sees. */
  it("gives a different grid at each step on the windows people actually have", () => {
    for (const windowWidth of [1280, 1920]) {
      const width = contentWidthAt(windowWidth);
      const small = feedGridColumnCount(width, "small");
      const medium = feedGridColumnCount(width, "medium");
      const large = feedGridColumnCount(width, "large");
      expect(small).toBeGreaterThan(medium);
      expect(medium).toBeGreaterThan(large);
    }
  });
});
