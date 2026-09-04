/**
 * Purpose: public entry of the zero-LLM demo seed (spec 035 T7b).
 * Main exports: insertDemoData, wipeDemoData, WIPE_DEMO_REFERENCING_TABLES, DEMO_PAIR,
 * SeedSummary, demoTextFor, DEMO_TEXT_BY_LANGUAGE, CONCEPT_IDS.
 */

export { insertDemoData, type SeedSummary } from "./insert";
export { DEMO_PAIR } from "./shared";
export { DEMO_TEXT_BY_LANGUAGE, demoTextFor } from "./text";
export { CONCEPT_IDS, type ConceptId, type DemoText } from "./text/demoText";
export { WIPE_DEMO_REFERENCING_TABLES, wipeDemoData } from "./wipe";
