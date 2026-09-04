/**
 * Purpose: bucket 3 of the demo seed's node landscape (spec 035 T7b) — 8 nodes met for the
 * first time within the last two weeks, one of them today, feeding dailyBite/smallWins.
 * Main exports: FRESH.
 */
import { ASTRO_ROOT, type ConceptSpec, JS_ROOT } from "./conceptSpecTypes";

export const FRESH: readonly ConceptSpec[] = [
  { id: "gravitational-lensing", domain: "astro", parentId: ASTRO_ROOT, offsetsDays: [0] },
  { id: "debounce-throttle", domain: "js", parentId: JS_ROOT, offsetsDays: [1] },
  { id: "white-dwarf", domain: "astro", parentId: ASTRO_ROOT, offsetsDays: [3] },
  { id: "es-modules", domain: "js", parentId: JS_ROOT, offsetsDays: [5] },
  { id: "neutron-star", domain: "astro", parentId: ASTRO_ROOT, offsetsDays: [6] },
  { id: "recursion-call-stack", domain: "js", parentId: JS_ROOT, offsetsDays: [9] },
  { id: "cmb", domain: "astro", parentId: ASTRO_ROOT, offsetsDays: [11] },
  { id: "regex-capture-groups", domain: "js", parentId: JS_ROOT, offsetsDays: [13] },
];
