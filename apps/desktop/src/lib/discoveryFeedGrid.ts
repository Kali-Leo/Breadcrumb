/**
 * Purpose: the discovery feed's grid geometry (spec 054 §(b)). The three numbers the grid's CSS is
 * built from live here together with the arithmetic the browser does with them, so "how many
 * columns at this window width, and how wide is one card" is answerable in a test instead of only
 * on a real screen.
 *
 * Why these numbers: the feed used to be `grid-cols-1 / sm:2 / xl:3`, which stops adding columns at
 * 1280px — a 1920px window drew three cards about 613px wide each, wider than YouTube's own 500px
 * ceiling, which is what "一屏只有几张巨卡" was. A track that fills as many 320px-or-wider columns as
 * fit replaces the breakpoint ladder, and a capped content width stops a very wide monitor from
 * growing the cards further.
 *
 * `auto-fill`, never `auto-fit`: `auto-fit` collapses the tracks no card landed in and stretches
 * the last row's cards across the leftover space, so a batch that ends on an odd number would draw
 * one enormous card.
 * Main exports: FEED_GRID_MINIMUM_CARD_PX, FEED_GRID_GAP_PX, FEED_GRID_MAX_CONTENT_PX,
 * FEED_GRID_TEMPLATE_COLUMNS, feedGridColumnCount, feedGridCardWidthPx.
 */

/** The narrowest a card may be drawn. Just above YouTube's measured 310px flex-basis, because our
 * card carries a source name and a type mark under the picture, not only a title. */
export const FEED_GRID_MINIMUM_CARD_PX = 320;

/** bilibili's measured grid gap. */
export const FEED_GRID_GAP_PX = 20;

/** Past this the grid stops widening and centres itself; 小红书 stops at 1728px, bilibili at
 * 1980px. */
export const FEED_GRID_MAX_CONTENT_PX = 1680;

export const FEED_GRID_TEMPLATE_COLUMNS = `repeat(auto-fill, minmax(${FEED_GRID_MINIMUM_CARD_PX}px, 1fr))`;

function usableWidth(contentWidthPx: number): number {
  return Math.min(Math.max(contentWidthPx, 0), FEED_GRID_MAX_CONTENT_PX);
}

/**
 * How many columns the browser draws in a container this wide. This is the CSS Grid rule for
 * `repeat(auto-fill, minmax(N, 1fr))`: fit as many N-wide tracks as the width allows once the gaps
 * between them are paid for, and never fewer than one.
 */
export function feedGridColumnCount(contentWidthPx: number): number {
  const width = usableWidth(contentWidthPx);
  const fits = Math.floor(
    (width + FEED_GRID_GAP_PX) / (FEED_GRID_MINIMUM_CARD_PX + FEED_GRID_GAP_PX),
  );
  return Math.max(1, fits);
}

/** How wide one card ends up: the leftover width after the gaps, split evenly (`1fr` each). */
export function feedGridCardWidthPx(contentWidthPx: number): number {
  const width = usableWidth(contentWidthPx);
  const columns = feedGridColumnCount(contentWidthPx);
  return (width - (columns - 1) * FEED_GRID_GAP_PX) / columns;
}
