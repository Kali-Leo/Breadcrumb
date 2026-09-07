/**
 * Purpose: bucket 2 of the demo seed's node landscape — 8 nodes with a single
 * sighting old enough (~66-80 days) that the stock FSRS scheduler's retrievability has
 * genuinely dropped below the 0.6 reunion-waiting threshold.
 * Main exports: WAITING.
 */
import { ASTRO_ROOT, type ConceptSpec, JS_ROOT } from "./conceptSpecTypes";

export const WAITING: readonly ConceptSpec[] = [
  { id: "event-horizon", domain: "astro", parentId: ASTRO_ROOT, offsetsDays: [66] },
  { id: "async-await", domain: "js", parentId: JS_ROOT, offsetsDays: [68] },
  { id: "tidal-locking", domain: "astro", parentId: ASTRO_ROOT, offsetsDays: [70] },
  { id: "prototype-chain", domain: "js", parentId: JS_ROOT, offsetsDays: [72] },
  { id: "kepler-laws", domain: "astro", parentId: ASTRO_ROOT, offsetsDays: [74] },
  { id: "destructuring", domain: "js", parentId: JS_ROOT, offsetsDays: [76] },
  { id: "magnitude-scale", domain: "astro", parentId: ASTRO_ROOT, offsetsDays: [78] },
  { id: "array-higher-order", domain: "js", parentId: JS_ROOT, offsetsDays: [80] },
];
