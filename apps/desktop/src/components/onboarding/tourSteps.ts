/**
 * Purpose: the route the guided tour walks, as data.
 *
 * Six steps, which is the upper end of what the research on product tours says people finish
 * — the advice is 3–5 for a simple product, and this one has a map, a review model and a
 * spending page that all need pointing at once. Each step names a real element by its
 * `data-tour` attribute and the view it lives in, so the tour drives the actual app rather
 * than a reproduction of it.
 *
 * The order is a story, not a feature list: you talk to it (1), that quietly becomes a map
 * (2, 3), the map fades where you have not been (4), here is what that adds up to (5), and
 * here is what it costs before you turn anything on (6). The last step hands over — the
 * composer is highlighted and the person is asked to type, because a tour that ends in
 * reading ends in nothing.
 *
 * Main exports: TOUR_STEPS, DEMO_TOUR_STEPS.
 */
import type { TourStep } from "./SpotlightTour";

/** With the demo learner installed, so every step has something real to point at. */
export const DEMO_TOUR_STEPS: readonly TourStep[] = [
  { id: "chat", view: "chat", target: "composer", place: "top" },
  { id: "trail", view: "chat", target: "trail", place: "end" },
  { id: "map", view: "map", target: "map-canvas", place: "start" },
  { id: "mirror", view: "map", target: "mirror", place: "start" },
  { id: "spending", view: "settings", target: "billing-tab", place: "bottom" },
  { id: "yourTurn", view: "chat", target: "composer", place: "top" },
];

/** Without the demo: the map and the review panel would be empty, and pointing at an empty
 * map to explain what a map does is exactly the failure this replaces. Those two steps are
 * dropped rather than shown hollow. */
export const TOUR_STEPS: readonly TourStep[] = [
  { id: "chat", view: "chat", target: "composer", place: "top" },
  { id: "mapEmpty", view: "map", target: "map-canvas", place: "start" },
  { id: "spending", view: "settings", target: "billing-tab", place: "bottom" },
  { id: "yourTurn", view: "chat", target: "composer", place: "top" },
];
