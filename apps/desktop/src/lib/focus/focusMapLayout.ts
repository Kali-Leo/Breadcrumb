/**
 * Purpose: compatibility forwarder. The focus-map layout math moved to
 * @breadcrumb/feature-explore (2026-09-02) — it is pure pixel arithmetic with no DOM and no
 * app state, and the focus-session logic it serves already lived in that package. This file
 * exists so the components importing it by path keep working until they are pointed at the
 * package directly; nothing new should import from here.
 * Main exports: everything from @breadcrumb/feature-explore's mapLayout.
 */
export {
  COLUMN_WIDTH,
  type FocusMapLayout,
  type FocusMapLink,
  type FocusMapNode,
  type FocusMapStation,
  layoutFocusMap,
  ROW_HEIGHT,
  STATION_X,
  TOP_MARGIN,
} from "@breadcrumb/feature-explore";
