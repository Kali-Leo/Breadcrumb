/**
 * Purpose: the discovery feed's grid geometry (spec 054 §(b)). The numbers the grid's CSS is built
 * from live here together with the arithmetic the browser does with them, so "how many columns at
 * this window width, and how wide is one card" is answerable in a test instead of only on a real
 * screen.
 *
 * Why the minimum moved from 320px to 300px: the app's sidebar is 240px and the feed pads itself
 * 24px on each side, so a 1280px window — the size the app opens at — lays its cards out in 992px.
 * 992px misses three 320px tracks by 8px, so the grid fell back to two columns 486px wide, which is
 * what "卡片太大了" was (Leo 2026-08-18). 300px clears three tracks at that width with room to
 * spare, and no window draws a card wider than 460px at the middle size.
 *
 * Why three sizes: how big a card should be is partly taste and partly how far away the monitor is,
 * and neither is knowable from the window width. The reader picks one; the grid still adapts to the
 * window inside the size they picked.
 *
 * `auto-fill`, never `auto-fit`: `auto-fit` collapses the tracks no card landed in and stretches
 * the last row's cards across the leftover space, so a batch that ends on an odd number would draw
 * one enormous card.
 * Main exports: DiscoveryCardSize, FEED_GRID_MINIMUM_CARD_PX_BY_SIZE, FEED_GRID_MAXIMUM_CARD_PX,
 * FEED_GRID_GAP_PX, FEED_GRID_MAX_CONTENT_PX, feedGridTemplateColumns, feedGridColumnCount,
 * feedGridCardWidthPx, isDiscoveryCardSize.
 */

/** The three steps the reader can choose between. */
export type DiscoveryCardSize = "small" | "medium" | "large";

export const DISCOVERY_CARD_SIZES: readonly DiscoveryCardSize[] = ["small", "medium", "large"];

/** The middle step: a 1280px window gets three columns, a 1920px window five. */
export const DEFAULT_DISCOVERY_CARD_SIZE: DiscoveryCardSize = "medium";

/**
 * The narrowest a card may be drawn at each step — the one number each step changes.
 *
 * - small (230px): denser than YouTube, still well above 小红书's measured 203px floor.
 * - medium (300px): just under YouTube's 310px flex-basis, which is where a card carrying a
 *   picture, a source name and a two-line title stops being comfortable.
 * - large (340px): the size the feed drew before this change at a 1280px window, kept as a choice
 *   for anyone who liked it.
 */
export const FEED_GRID_MINIMUM_CARD_PX_BY_SIZE: Readonly<Record<DiscoveryCardSize, number>> = {
  small: 230,
  medium: 300,
  large: 340,
};

/** YouTube's measured ceiling for one card. Only ever reached on a window too narrow to fit two
 * columns, where without it a single card would be as wide as the whole feed. */
export const FEED_GRID_MAXIMUM_CARD_PX = 500;

/** bilibili's measured grid gap. */
export const FEED_GRID_GAP_PX = 20;

/** Past this the grid stops widening and centres itself; 小红书 stops at 1728px, bilibili at
 * 1980px. */
export const FEED_GRID_MAX_CONTENT_PX = 1680;

export function isDiscoveryCardSize(value: unknown): value is DiscoveryCardSize {
  return DISCOVERY_CARD_SIZES.includes(value as DiscoveryCardSize);
}

export function feedGridTemplateColumns(size: DiscoveryCardSize): string {
  return `repeat(auto-fill, minmax(${FEED_GRID_MINIMUM_CARD_PX_BY_SIZE[size]}px, 1fr))`;
}

function usableWidth(contentWidthPx: number): number {
  return Math.min(Math.max(contentWidthPx, 0), FEED_GRID_MAX_CONTENT_PX);
}

/**
 * How many columns the browser draws in a container this wide. This is the CSS Grid rule for
 * `repeat(auto-fill, minmax(N, 1fr))`: fit as many N-wide tracks as the width allows once the gaps
 * between them are paid for, and never fewer than one.
 */
export function feedGridColumnCount(contentWidthPx: number, size: DiscoveryCardSize): number {
  const minimum = FEED_GRID_MINIMUM_CARD_PX_BY_SIZE[size];
  const fits = Math.floor(
    (usableWidth(contentWidthPx) + FEED_GRID_GAP_PX) / (minimum + FEED_GRID_GAP_PX),
  );
  return Math.max(1, fits);
}

/** How wide one card ends up: the leftover width after the gaps, split evenly (`1fr` each), then
 * held to the ceiling — the card keeps its own max-width, so the track can be wider than the card
 * it holds and the card sits centred in it. */
export function feedGridCardWidthPx(contentWidthPx: number, size: DiscoveryCardSize): number {
  const width = usableWidth(contentWidthPx);
  const columns = feedGridColumnCount(contentWidthPx, size);
  const track = (width - (columns - 1) * FEED_GRID_GAP_PX) / columns;
  return Math.min(track, FEED_GRID_MAXIMUM_CARD_PX);
}
