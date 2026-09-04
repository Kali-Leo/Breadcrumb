/**
 * Purpose: bucket 1 of the demo seed's node landscape (spec 035 T7b) — 8 nodes with >= 4
 * spaced encounters ending very recently, so computeSettled/systemGauge see real
 * retention >= 0.9 and a healthy reencounter sample.
 * Main exports: MASTERED.
 */
import { ASTRO_ROOT, type ConceptSpec, JS_ROOT } from "./conceptSpecTypes";

export const MASTERED: readonly ConceptSpec[] = [
  { id: ASTRO_ROOT, domain: "astro", parentId: null, offsetsDays: [66, 51, 36, 21, 0] },
  {
    id: "stellar-spectra",
    domain: "astro",
    parentId: ASTRO_ROOT,
    offsetsDays: [64, 49, 34, 19, 0],
  },
  { id: JS_ROOT, domain: "js", parentId: null, offsetsDays: [62, 47, 32, 17, 0] },
  { id: "parallax", domain: "astro", parentId: ASTRO_ROOT, offsetsDays: [60, 45, 30, 15, 3] },
  { id: "closures", domain: "js", parentId: JS_ROOT, offsetsDays: [58, 43, 28, 13, 1] },
  { id: "transits", domain: "astro", parentId: ASTRO_ROOT, offsetsDays: [56, 41, 26, 11, 5] },
  { id: "event-loop", domain: "js", parentId: JS_ROOT, offsetsDays: [54, 39, 24, 9, 6] },
  { id: "promise-chains", domain: "js", parentId: JS_ROOT, offsetsDays: [52, 37, 22, 10, 4] },
];
