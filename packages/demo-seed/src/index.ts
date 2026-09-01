/**
 * Purpose: public entry of the zero-LLM demo seed (spec 035 T7b).
 * Main exports: insertDemoData, wipeDemoData, DEMO_PAIR, SeedSummary.
 */

export { insertDemoData, type SeedSummary } from "./insert";
export { DEMO_PAIR } from "./shared";
export { wipeDemoData } from "./wipe";
