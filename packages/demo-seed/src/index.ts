/**
 * Purpose: public entry of the zero-LLM demo seed (spec 035 T7b).
 * Main exports: insertDemoData, wipeDemoData, WIPE_DEMO_REFERENCING_TABLES, DEMO_PAIR,
 * SeedSummary.
 */

export { insertDemoData, type SeedSummary } from "./insert";
export { DEMO_PAIR } from "./shared";
export { WIPE_DEMO_REFERENCING_TABLES, wipeDemoData } from "./wipe";
