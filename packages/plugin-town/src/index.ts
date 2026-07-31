/**
 * Purpose: public entry of the town plugin (headless port of watabou's
 * TownGeneratorOS, GPL-3.0 — see THIRD_PARTY_NOTICES.md).
 * Main exports: generateTown, TownPlan, TownPatch, TownPoint.
 */
export { generateTown, type TownPatch, type TownPlan, type TownPoint } from "./town";
